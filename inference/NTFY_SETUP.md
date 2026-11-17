# Training Monitoring & Remote Control

Remote push notifications (via [ntfy](https://ntfy.sh)) plus a small TCP control
plane between the **trainer** and the **worker** fleet, so you can monitor training
progress, know instantly when a node dies, and tear the whole cluster down with one
command — all from your phone / a single terminal.

> **Status:** design + implementation guide. The training scripts run on the school
> cluster and are applied there by hand. Parameters near the top of each section are
> the agreed defaults and are meant to be tuned once observed on real hardware.

---

## 1. Topology at a glance

```
                       ntfy.sh  ─────────────►  phone
                          ▲  ▲  ▲
              (progress)  │  │  └── (TRAINER DOWN)
                          │  │
   ┌──────────────────────┴──┴─────────────────────────┐
   │                    TRAINER                          │        login node
   │  main thread : training loop + heartbeat touch      │   ┌───────────────────┐
   │  net thread  : TCP server (registry)                │   │ cron every 5 min: │
   │  recv thread : one per worker                        │◄──│ stat <shared>/    │
   │  stdin thread: shutdown / status / restart          │   │ heartbeat → ntfy  │
   └───────▲───────────▲───────────▲─────────────────────┘   └───────────────────┘
           │TCP        │TCP        │TCP           (NFS: inbox + heartbeat file)
      ┌────┴───┐  ┌────┴───┐  ┌────┴───┐
      │ worker │  │ worker │  │ worker │  … 14 hosts (marlin, perch, …)
      │ marlin │  │ perch  │  │ pollock│
      └────────┘  └────────┘  └────────┘
```

- **Trainer = server / registry** (mirrors `distributed_files/node/Discover.java`).
- **Workers = clients** (mirror `Peer.java`): connect in, `REGISTER`, answer `PING`,
  `DEREGISTER` on clean exit.
- **Transport:** persistent TCP, **newline-delimited JSON** messages.
- **Liveness = the connection**, not inbox writes. Inbox writes are ignored for
  health (game cadence scales ~16× across the sim schedule and is a bad proxy).

---

## 2. ntfy setup

### iOS
1. Install **ntfy** from the App Store.
2. Subscribe to your secret topic (below).

### Secret topic (run once on any node)
```bash
export NTFY_TOPIC="uttt-train-$(openssl rand -hex 6)"
echo "Your topic: $NTFY_TOPIC"
curl -m 5 -d "ntfy is working" -H "Title: Test" https://ntfy.sh/$NTFY_TOPIC   # expect a push
echo "export NTFY_TOPIC=$NTFY_TOPIC" >> ~/.bashrc                             # persist per node
```
The topic name is a password — anyone who knows it can read your notifications.
**Keep it out of git.** Egress to `ntfy.sh` from the compute nodes is already
confirmed working.

### Shared helper — `_ntfy` (put in both trainer.py and worker.py)
```python
import os, urllib.request
NTFY_TOPIC = os.getenv("NTFY_TOPIC", "")

def _ntfy(title, msg, priority="default", tags=None):
    if not NTFY_TOPIC:
        return
    try:
        headers = {"Title": title, "Priority": priority, "Content-Type": "text/plain"}
        if tags:
            headers["Tags"] = ",".join(tags)
        req = urllib.request.Request(f"https://ntfy.sh/{NTFY_TOPIC}",
                                     data=msg.encode(), headers=headers, method="POST")
        urllib.request.urlopen(req, timeout=5)
    except Exception:
        pass   # notifications are best-effort; never let one break training/self-play
```

---

## 3. Wire protocol (shared)

Newline-delimited JSON — one message per line. TCP is a byte stream, so the receiver
buffers bytes and splits on `\n` (the Python analogue of the `readInt`/`readFully`
framing in `distributed_files/transport/TCPReceiverThread.java`).

```python
import json, socket

# message types
REGISTER   = "register"     # worker -> trainer  {"type","host"}
DEREGISTER = "deregister"   # worker -> trainer  {"type","host","reason"}
PING       = "ping"         # trainer -> worker
PONG       = "pong"         # worker -> trainer  {"type","host"}
SHUTDOWN   = "shutdown"     # trainer -> worker  (fleet teardown)

def send_msg(sock, obj):
    sock.sendall((json.dumps(obj) + "\n").encode())

def recv_lines(sock, buf):
    """Append one recv() to buf, yield complete JSON messages, return leftover buf."""
    data = sock.recv(4096)
    if not data:
        raise ConnectionError("peer closed")
    buf += data
    while b"\n" in buf:
        line, buf = buf.split(b"\n", 1)
        if line.strip():
            yield json.loads(line)
    return buf
```

> Do **not** use `pickle` on the control plane (unsafe over a socket). JSON only.
> Game files keep using torch/pickle — that's a separate concern.

---

## 4. Trainer changes (`trainer.py`)

### 4.1 Parameters
```python
LISTEN_PORT        = 5001
PING_INTERVAL      = 30      # seconds between keepalive pings
RECONNECT_WINDOW   = 600     # 10 min: no re-REGISTER within this -> declare dead
HEARTBEAT_PATH     = os.path.join(args.shared_dir, "heartbeat")
FLEET_HEALTH_EVERY = 6 * 3600  # 6 h wall-clock fleet-health ping
```

### 4.2 Registry + networking threads

The training loop stays on the main thread. Networking runs in background threads and
shares a lock-protected roster (the Python analogue of `Discover`'s `peerToConnMap`).

```python
import threading, time

roster_lock = threading.Lock()
roster = {}   # host -> {"sock","last_seen","state": "alive"|"gone"}

def _server_thread():
    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind(("0.0.0.0", LISTEN_PORT))
    srv.listen()
    while True:
        conn, _ = srv.accept()
        threading.Thread(target=_recv_thread, args=(conn,), daemon=True).start()

def _recv_thread(conn):
    buf, host = b"", None
    try:
        while True:
            for msg in recv_lines(conn, buf):   # (see note below on generator+buffer)
                t = msg["type"]
                if t == REGISTER:
                    host = msg["host"]
                    with roster_lock:
                        rejoin = host in roster and roster[host]["state"] == "gone"
                        roster[host] = {"sock": conn, "last_seen": time.time(), "state": "alive"}
                    _lifecycle_note(host, rejoined=rejoin)
                elif t == PONG:
                    with roster_lock:
                        if host in roster:
                            roster[host]["last_seen"] = time.time()
                elif t == DEREGISTER:
                    with roster_lock:
                        roster.pop(host, None)   # clean exit: leave the roster silently
    except (ConnectionError, OSError):
        pass   # socket dropped — worker offline; grace clock handled by _reaper_thread
    finally:
        conn.close()
```

> **Buffering note:** `recv_lines` above `return`s the leftover `buf`, so wire it as
> `buf = yield from recv_lines(...)` or inline the buffer loop — keep the leftover
> between reads so split messages reassemble.

### 4.3 Ping + reaper (declare death)
```python
def _ping_thread():
    while True:
        time.sleep(PING_INTERVAL)
        with roster_lock:
            socks = [(h, r["sock"]) for h, r in roster.items() if r["state"] == "alive"]
        for h, s in socks:
            try: send_msg(s, {"type": PING})
            except OSError: pass   # drop shows up as a stale last_seen -> reaper handles it

def _reaper_thread():
    while True:
        time.sleep(30)
        now = time.time()
        dead = []
        with roster_lock:
            alive = sum(1 for r in roster.values() if r["state"] == "alive")
            for h, r in roster.items():
                if r["state"] == "alive" and now - r["last_seen"] > RECONNECT_WINDOW:
                    r["state"] = "gone"; dead.append((h, alive - 1))
        for h, remaining in dead:
            _ntfy(f"WORKER DEAD — {h}", f"No contact for >{RECONNECT_WINDOW//60} min. "
                  f"{remaining}/{len(roster)} alive.", priority="high", tags=["skull"])
```

### 4.4 Heartbeat touch (for the login-node watchdog)

At the **top of the training `while True:` loop** — outside the ingest `if` so it
still fires when the inbox is empty:
```python
from pathlib import Path
Path(HEARTBEAT_PATH).touch()
```

### 4.5 Fleet-health ping (every 6 h)
```python
_last_health = time.time()
# ... in the loop:
if time.time() - _last_health > FLEET_HEALTH_EVERY:
    _last_health = time.time()
    with roster_lock:
        alive = [h for h, r in roster.items() if r["state"] == "alive"]
        dead  = [h for h, r in roster.items() if r["state"] == "gone"]
    _ntfy("Fleet health", f"{len(alive)}/{len(alive)+len(dead)} alive"
          + (f"\nDead: {', '.join(dead)}" if dead else ""), tags=["bar_chart"])
```

### 4.6 Terminal commands (stdin thread — mirrors `Discover.readTerminal`)
```python
def _stdin_thread():
    for line in iter(input, None):
        cmd, *rest = line.strip().split()
        if cmd == "shutdown":
            _fleet_shutdown()
        elif cmd == "status":
            with roster_lock:
                for h, r in roster.items():
                    print(f"  {h:12} {r['state']:5}  last {int(time.time()-r['last_seen'])}s ago")
        elif cmd == "restart" and rest:
            _restart_host(rest[0])   # SSH relaunch of one worker; auto-restart deferred

def _fleet_shutdown():
    save_checkpoint()                       # persist current model first
    with roster_lock:
        socks = [r["sock"] for r in roster.values() if r["state"] == "alive"]
    for s in socks:
        try: send_msg(s, {"type": SHUTDOWN})
        except OSError: pass
    deadline = time.time() + 60             # bounded wait for DEREGISTERs
    while time.time() < deadline:
        with roster_lock:
            if not any(r["state"] == "alive" for r in roster.values()):
                break
        time.sleep(1)
    _ntfy("Fleet shutdown complete", "Trainer exiting.", tags=["checkered_flag"])
    os._exit(0)
```

### 4.7 Progress notifications (keep the existing `Notifier`)

Retain the training-progress notifier from the prior design — VSA & sharpness
milestones, LR warm-restarts, sim-phase changes, VLW ceiling, and the per-100-iter
summary. Fold the alive count into the periodic summary line as well. (The old
per-100-iter summary only fires on training rounds; the 6 h fleet-health ping is the
wall-clock signal that doesn't depend on training pace.)

Start all four background threads after the checkpoint-load block, and fire a startup
note once the first workers register:
```python
for fn in (_server_thread, _ping_thread, _reaper_thread, _stdin_thread):
    threading.Thread(target=fn, daemon=True).start()
_ntfy("Trainer started", "Registry up. Waiting for workers…", tags=["rocket"])
```

---

## 5. Worker changes (`worker.py`)

### 5.1 Parameters
```python
TRAINER_HOST     = os.getenv("TRAINER_HOST", "<trainer-hostname>")
TRAINER_PORT     = 5001
RECONNECT_EVERY  = 30       # seconds between reconnect attempts
LOST_TRAINER_MAX = 600      # 10 min unable to (re)connect -> self-terminate
BUFFER_CAP       = 300      # max unsaved games held in RAM (OOM guard)
WRITE_FAIL_MAX   = 720      # 12 min unable to write inbox -> self-terminate
```

### 5.2 Connection, receiver, reconnect

A background thread owns the socket, answers `PING` with `PONG`, honours `SHUTDOWN`,
and on any drop reconnects with backoff. If it can't (re)establish within
`LOST_TRAINER_MAX`, it triggers graceful shutdown ("lost trainer").

```python
_stop = threading.Event()
_lost_since = None

def _net_thread():
    global _lost_since
    while not _stop.is_set():
        try:
            sock = socket.create_connection((TRAINER_HOST, TRAINER_PORT), timeout=10)
            send_msg(sock, {"type": REGISTER, "host": WORKER_ID})
            _lost_since = None
            buf = b""
            while not _stop.is_set():
                for msg in recv_lines(sock, buf):
                    if msg["type"] == PING:
                        send_msg(sock, {"type": PONG, "host": WORKER_ID})
                    elif msg["type"] == SHUTDOWN:
                        graceful_shutdown("trainer command"); return
        except (OSError, ConnectionError):
            if _lost_since is None:
                _lost_since = time.time()
            if time.time() - _lost_since > LOST_TRAINER_MAX:
                graceful_shutdown("lost trainer"); return
            time.sleep(RECONNECT_EVERY)
```

> The receiver answers `PING` from this thread, so a `PONG` proves the process/threads
> are alive. Productivity is intentionally **not** reported (a stuck self-play loop is
> out of scope for now).

### 5.3 Bounded game buffer + write-failure shutdown

Replace the current unbounded save block (today `game_buffer` is only cleared on a
*successful* `os.rename`, so an NFS outage grows it without limit → OOM):

```python
_write_fail_since = None

def _flush_buffer():
    global _write_fail_since
    try:
        filename = f"game_{WORKER_ID}_{uuid.uuid4()}.pt"
        path = os.path.join(INBOX_DIR, filename)
        torch.save(game_buffer, path + ".tmp")
        os.rename(path + ".tmp", path)
        game_buffer.clear()
        _write_fail_since = None
        return True
    except Exception as e:
        if _write_fail_since is None:
            _write_fail_since = time.time()
        print(f"Save Error: {e}")
        if len(game_buffer) > BUFFER_CAP:
            del game_buffer[:len(game_buffer) - BUFFER_CAP]   # drop oldest; cap RAM
        if time.time() - _write_fail_since > WRITE_FAIL_MAX:
            graceful_shutdown("cannot reach inbox")
        return False
```

### 5.4 Graceful shutdown + signals + crash wrapper

```python
import signal

def graceful_shutdown(reason):
    if _stop.is_set():
        return
    _stop.set()
    _ntfy(f"Worker stopping — {WORKER_ID}", reason, tags=["wave"])
    try: send_msg(_sock, {"type": DEREGISTER, "host": WORKER_ID, "reason": reason})
    except Exception: pass   # if the network is fully cut, ntfy + DEREGISTER may fail; still exit
    os._exit(0)

# SIGINT (Ctrl-C) + SIGTERM (kill). SIGHUP (tmux/SSH drop) is intentionally NOT caught
# yet — add it here later if we want disconnect alerting (see design doc §7).
signal.signal(signal.SIGINT,  lambda *_: graceful_shutdown("SIGINT"))
signal.signal(signal.SIGTERM, lambda *_: graceful_shutdown("SIGTERM"))

if __name__ == "__main__":
    threading.Thread(target=_net_thread, daemon=True).start()
    threading.Thread(target=_stdin_thread, daemon=True).start()   # local "shutdown" cmd
    try:
        worker_loop()
    except SystemExit:
        raise
    except Exception as e:
        _ntfy(f"Worker CRASHED — {WORKER_ID}", f"{type(e).__name__}: {e}",
              priority="urgent", tags=["rotating_light"])
        raise
```

Add the model-load-error notification inside `load_and_update_sims`' `except` (fires
at most once — a worker that can't load the model can't start):
```python
except Exception as e:
    _ntfy(f"Model load error — {WORKER_ID}", f"{type(e).__name__}: {e}", tags=["warning"])
    return False
```

### 5.5 Launch script change

`bash_scripts/workers.sh` must pass the trainer's address:
```bash
WORKER_CMD="python worker.py --shared_dir . --device $DEVICE"
# add:  TRAINER_HOST=<trainer-hostname>  (export before the command, or add a --trainer-host arg)
```

---

## 6. Login-node watchdog (`bash_scripts/trainer_watchdog.sh`, cron every 5 min)

Independent failure domain from the trainer. Catches SIGKILL/OOM/storage-full/NFS-hang
(all of which leave the trainer no chance to notify). Treats an unreadable heartbeat as
alert-worthy, not a skip.

```bash
#!/bin/bash
HEARTBEAT="/s/chopin/k/grad/camsuess/Desktop/dev/cs440/UTTT/heartbeat"
THRESHOLD=600   # 10 min
: "${NTFY_TOPIC:?set NTFY_TOPIC}"

if [ ! -f "$HEARTBEAT" ]; then
    curl -m 5 -d "Heartbeat file missing / NFS unreadable" \
         -H "Title: TRAINER DOWN?" -H "Priority: urgent" https://ntfy.sh/$NTFY_TOPIC
    exit 0
fi
AGE=$(( $(date +%s) - $(stat -c %Y "$HEARTBEAT") ))
if [ "$AGE" -gt "$THRESHOLD" ]; then
    curl -m 5 -d "No heartbeat for ${AGE}s" \
         -H "Title: TRAINER DOWN" -H "Priority: urgent" https://ntfy.sh/$NTFY_TOPIC
fi
```
Crontab: `*/5 * * * * NTFY_TOPIC=<topic> /path/to/trainer_watchdog.sh`

---

## 7. Notification reference

| Emitter | Event | Priority | Trigger |
|---|---|---|---|
| Trainer | Started / resumed | default | registry up |
| Trainer | Workers registered (coalesced) | default | startup roster settles |
| Trainer | Progress milestones (VSA, sharpness, LR restart, phase, VLW) | high/default | see `Notifier` |
| Trainer | Periodic training summary | default | every 100 iters |
| Trainer | **WORKER DEAD** (+ N/M alive) | high | no re-REGISTER within 10 min |
| Trainer | **Fleet health** (N/M alive, dead list) | default | every 6 h wall-clock |
| Trainer | Fleet shutdown complete | default | `shutdown` command finishes |
| Worker | Graceful stop + reason | default | SIGINT/SIGTERM, `SHUTDOWN`, lost-trainer, inbox-unreachable |
| Worker | Model load error | high | can't load model at startup |
| Worker | Uncaught crash | urgent | exception escapes `worker_loop` |
| Login node | **TRAINER DOWN** | urgent | heartbeat stale >10 min / missing |

**Dropped as noise** (fleet-correlated → 14× spam): per-worker "started", per-worker
sim upgrade, per-worker single save error, per-worker "model synced".

---

## 8. Deferred / future

- **Auto-restart** of dead workers (with per-host attempt caps) — the `restart <host>`
  command is the manual stopgap; automatic relaunch is a later, more nuanced topic
  (restart-loop guards, root-cause gating, env replication).
- **SIGHUP** handling in the worker for SSH/tmux disconnect alerting — placeholder
  comment already in §5.4; decide signal-to-noise before enabling.

---

## 9. Parameter summary (all tunable)

| Name | Default | Meaning |
|---|---|---|
| `PING_INTERVAL` | 30 s | trainer→worker keepalive cadence |
| `RECONNECT_WINDOW` | 10 min | silence before trainer declares a worker dead |
| `RECONNECT_EVERY` | 30 s | worker reconnect-attempt cadence |
| `LOST_TRAINER_MAX` | 10 min | worker self-terminates after this long with no trainer |
| `BUFFER_CAP` | 300 games | RAM cap on unsaved self-play (OOM guard) |
| `WRITE_FAIL_MAX` | 12 min | worker self-terminates after this long unable to write inbox |
| heartbeat `THRESHOLD` | 10 min | login-node watchdog staleness cutoff |
| `FLEET_HEALTH_EVERY` | 6 h | wall-clock fleet-health ping |
