# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

Ultimate Tic-Tac-Toe played against a trained AlphaZero-style model. Includes a "learning mode" where Claude explains the best move and why, streaming via SSE.

## Development commands

**Start everything (recommended):**
```bash
./run.sh   # opens a tmux session with all four services
```

**Individual services:**
```bash
# Shared package (must be built before backend or frontend start)
pnpm --filter @uttt/shared build          # one-shot build
pnpm --filter @uttt/shared dev            # watch mode

# Backend (NestJS, port 3000)
pnpm --filter @uttt/backend dev           # watch mode
pnpm --filter @uttt/backend typecheck     # type-check only

# Frontend (Vite + React, port 5173)
pnpm --filter @uttt/frontend dev
pnpm --filter @uttt/frontend lint

# Inference service (FastAPI + MCTS, port 8000) — run from inference/
cd inference && source .venv/bin/activate
uvicorn main:app --reload --port 8000
```

**Build shared after edits** (if not in watch mode):
```bash
pnpm --filter @uttt/shared build
```

There are no automated tests in this codebase.

## Architecture

Four services communicate over HTTP:

```
Browser → Frontend (Vite/React :5173)
              ↓ /api/* (Vite proxy strips /api)
         Backend (NestJS :3000)
              ↓ POST /move
         Inference (FastAPI :8000)
```

The hint feature uses a separate SSE stream: `GET /games/:id/hint` → NestJS → Anthropic Claude Haiku.

### `packages/shared` (`@uttt/shared`)

Pure TypeScript game rules. Both backend and frontend import from here. Key exports:
- `GameState` — `{ board: Cell[81], macro: MacroResult[9], player: Player, nextMicro: number|null }`
- `applyMove`, `getLegalMoves`, `isLegalMove`, `isTerminal`, `evaluate`, `initialState`

**Cell encoding:** `1` = X, `-1` = O, `0` = empty, `2` = draw (macro only). This encoding is shared with the Python inference service — JSON state flows between all three layers without re-encoding.

**Board layout:** flat 81-element array, macro-major order. Index formula: `board[macro * 9 + cell]`. Cells 0-8 within each micro-board follow standard 3×3 left-to-right, top-to-bottom order.

`@uttt/shared` is compiled to `dist/` before being imported. Always rebuild after editing `src/`.

### `packages/backend` (`@uttt/backend`)

NestJS with three modules:

- **`GamesModule`** — in-memory `Map<id, StoredGame>` (no database; all state lost on restart). `GamesService` holds the game store and computes `GameAnalysis` from raw inference data. `GamesController` exposes REST endpoints and the SSE hint stream.
- **`InferenceModule`** — HTTP client to the Python service. Handles the camelCase↔snake_case translation: `nextMicro` → `next_micro` going out, and the response fields (`visit_share`, `q_value`, etc.) are camelCased in `GamesService.buildAnalysis()` before being returned to the frontend.
- **`LLMModule`** — Anthropic SDK wrapper. `LLMService.streamHint()` is an async generator that yields text tokens from Claude Haiku. `prompt-builder.ts` assembles the full game-context prompt.

Requires `packages/backend/.env` with `ANTHROPIC_API_KEY=...`.

Inference service URL defaults to `http://localhost:8000`; override with `INFERENCE_URL` env var.

### `packages/frontend` (`@uttt/frontend`)

React + Vite. Key files:

- `api/client.ts` — all backend calls. The `AI_SIMS` constant (default 100) controls MCTS depth and is the primary knob for AI strength vs. response time.
- `hooks/useGame.ts` — single source of truth for game state. Manages the human-move → AI-move → analysis fetch sequence.
- `components/Board.tsx` — renders the 9×9 grid. Accepts `hintMove` + `hintKey` props; `hintKey` increments force a React remount to restart the cell's flash animation.
- `components/HintPanel.tsx` — renders the learning-mode panel and streams hint tokens via `EventSource`.

The Vite dev server proxies `/api/*` to `http://localhost:3000`, stripping the prefix.

### `inference/` (Python)

FastAPI + PyTorch. Loads the model at startup from `MODEL_PATH` (default `models/hard.pth`). Supports both full training checkpoints (`model_state_dict` key) and slimmed playable exports (plain state dict). Auto-detects architecture (channels, residual blocks, input channels) from the weights.

Three difficulty models live in `inference/models/`:

| File | Arch | Notes |
|------|------|-------|
| `easy.pth` | 128ch / 4-input / 3M params | Beatable by beginners |
| `medium.pth` | 128ch / 7-input / 3M params | Won 100% vs easy in tournament |
| `hard.pth` | 256ch / 7-input / 12M params | Best trained model; won 100% vs medium |

`/move` POST: accepts a snake_case `GameStateDTO`, runs a fresh MCTS instance per request, and returns `MoveResponse` with `best_move`, `candidates` (per-move visit counts, Q-values, priors), `value_estimate` (network value from O's perspective), `search_value` (visit-weighted mean Q), `principal_variation`, and `sims_used`.

**Value convention:** `value_estimate` is from O's POV. Positive = O winning. The backend converts to X win probability via `(networkValue + 1) / 2`. This convention flows from AlphaZero where the value head outputs from the current player's perspective, but the inference service always returns from O's perspective since O is the AI.

## Key cross-cutting concerns

**State immutability:** `GameState` is treated as readonly throughout. `applyMove` returns a new object; never mutate in place.

**PV index convention:** `principalVariation[0]` = the AI's move just played (already on the board), `principalVariation[1]` = recommended X response, `[2]` = AI's expected counter, etc. `prompt-builder.ts` starts iteration at index 1 for the human hint.

**Swapping models:** change `MODEL_PATH` in `inference/main.py` or set the env var to `models/easy.pth`, `models/medium.pth`, or `models/hard.pth`. Uvicorn `--reload` detects the change without a restart. To export a slim playable checkpoint from a full training checkpoint:
```python
import torch
d = torch.load('checkpoint.pth', map_location='cpu')
torch.save(d['model_state_dict'], 'models/hard.pth')
```
