# Handoff — Arch 6 Training Analysis & Arch 7 Planning

**Date:** 2026-07-19  
**Context:** Arch 6 training is at 3,485 iterations (cycle 4, 57.7% elapsed). The last session analysed three oscillation cycles and concluded it is time to stop and redesign. This document summarises the findings and recommended next steps for Arch 7.

---

## Current State

- **CSV:** `inference/training_files/training_metrics.csv` (3,485 rows)
- **Model:** `inference/models/hard.pth` — Arch 6, 512ch/20B/SE/7-in/32ph, ~47.7M params
- **Model definition:** `inference/game_utils.py` — `UTTTNet` class, policy head at lines 204–206/230–232
- **Training code:** `inference/training_files/trainer.py`

**All-time records (Arch 6):**

| Metric | Value | Iter |
|---|---|---|
| policy_loss | 1.165 | 2863 |
| value_loss | 0.0231 | 3476 |
| VSA | 93.2% | 3335 |
| sharpness | 51.0% | 3457 |

**Current (iter 3485):** sharpness 50.9%, VSA 92.4%, VLW 10.1, piv 4.92, LR 1.4e-4.  
Third policy regression underway from iter 3457 peak.

---

## Why Stop

- **Policy loss stalled 600+ iters.** Record of 1.165 (iter 2863) not broken across two full oscillation cycles; last two peaks regressed it (1.170, 1.173).
- **Gains per cycle are tiny.** Sharpness +0.2–0.3pp/cycle, VSA +0.1–0.8pp/cycle.
- **VLW at 10.1 is crowding out policy.** Adaptive controller climbs VLW whenever piv drifts above 5 during recovery, consuming gradient budget that policy needs.
- **LR past midpoint.** At 1.4e-4 heading to zero, the remaining 1,016 iters are the refinement tail of the cosine curve. Historical peaks come in the first half.
- **Oscillation pattern is self-limiting.** Three cycles (peaks at 2863, 3091–3099, 3457–3476) recover value/VSA but not policy loss. The cycle is driven by VLW dynamics, not genuine architectural headroom.

---

## Recommended Changes for Arch 7

### High confidence (data-backed)

1. **Lower VLW ceiling to 6–7 from the start.** At 10.1 value dominates gradient flow. A tighter ceiling forces symmetric co-improvement. Most likely to unlock policy loss gains.
2. **Softer sim curriculum: 800 → 1200 → 1600.** The oscillation pattern begins at the 800→1600 jump. Each 1.5× step is more manageable than the current 2× step. Change sim count and cycle boundaries in trainer config.

### Medium confidence

3. **Separate LR for policy and value heads.** PyTorch optimizer param groups — run policy head at 0.5× body LR. When VLW is high the policy head gets disproportionate value gradient; lower LR gives it stability.
4. **Dirichlet noise scoped to the legal micro-board only.** Currently noise is uniform across all 81 positions. Concentrating it in the active micro-board forces richer exploration in the constrained action space, producing better policy targets.

### Lower confidence

5. **Widen value head (2ch → 8ch).** Value head hasn't changed across all six architectures. Value loss still declining — more expressive capacity could help it converge faster.
6. **Add a "moves since" input channel.** 7 input channels encode board state, player, and legal moves. A recency channel could help the policy weight recent forcing sequences more heavily.

### Do not bother

- More body depth/width — not the constraint (confirmed Arch 5→6).
- Attention in the body — SE blocks already provide global context gating.
- Deeper policy head (additional conv layer) — the body's 20 residual blocks already encode spatial context; the head just reads it out. Width (2→32ch) was the fix; structure isn't the bottleneck.

---

## Training Dashboard Artifacts

Updated each time a new CSV is uploaded. To update from a new session: fetch the artifact HTML via WebFetch, edit locally, then publish with the `url` parameter to preserve the same URLs.

- **Training metrics dashboard:** https://claude.ai/code/artifact/9777fad6-1cc6-4aad-9ec8-860d1a52ed3b
- **Architecture comparison:** https://claude.ai/code/artifact/10c7c833-1bcc-4bc8-a867-f158bf35763e

---

## Key Files

| File | Purpose |
|---|---|
| `inference/game_utils.py` | Model definition (`UTTTNet`) — policy head at lines 204–206 |
| `inference/training_files/trainer.py` | Training loop, VLW adaptive controller, curriculum config |
| `inference/training_files/training_metrics.csv` | All training data — source of truth for analysis |
| `inference/architectures.md` | Architecture history documentation |
| `inference/main.py` | Inference service — auto-detects model arch from weights |

## Persistent Memory

Full architecture progression and Arch 6 status:  
`/Users/cjs/.claude/projects/-Users-cjs-dev-projects-uttt-web-app/memory/project_training_history.md`

---

## Suggested Skills

- **`/dataviz`** — invoke before updating or creating any training chart or dashboard artifact
- **`/artifact-design`** — invoke before writing or redesigning any HTML artifact
- **`/grilling`** — useful for stress-testing Arch 7 design decisions before committing to a training run
