#!/bin/bash
# run.sh — start all UTTT development services in a tmux session.
#
# Usage (from the project root):
#   ./run.sh
#
# Windows:
#   1: inference  — Python FastAPI + MCTS model (port 8000)
#   2: backend    — NestJS API server (port 3000)
#   3: frontend   — Vite + React dev server (port 5173)
#   4: shared     — TypeScript watch mode (rebuilds @uttt/shared on change)
#
# Useful tmux shortcuts:
#   Ctrl+b 1/2/3   switch to window by number
#   Ctrl+b w       interactive window list
#   Ctrl+b d       detach (services keep running)
#   tmux attach -t uttt-dev   reattach later

set -e

SESSION="uttt-dev"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Kill any existing session ────────────────────────────────────────────────
tmux kill-session -t $SESSION 2>/dev/null || true

# ── Build shared package (fast, exits immediately) ───────────────────────────
# The backend and frontend both import from @uttt/shared/dist, so this must
# run before either service starts. Do it here rather than in a tmux window
# so we know it's complete before the other windows open.
echo "Building @uttt/shared..."
cd "$ROOT"
pnpm --filter @uttt/shared build
echo "@uttt/shared built. Starting services..."

# ── Window 1: inference service ──────────────────────────────────────────────
tmux new-session -d -s $SESSION -n "inference"

# Activate the Python virtual environment if it exists, otherwise fall back to
# whatever Python/uvicorn is on PATH (e.g. a conda environment).
if [ -f "$ROOT/inference/.venv/bin/activate" ]; then
  ACTIVATE="source $ROOT/inference/.venv/bin/activate && "
else
  ACTIVATE=""
fi

tmux send-keys -t "${SESSION}:inference" \
  "cd $ROOT/inference && ${ACTIVATE}uvicorn main:app --reload --port 8000" C-m

# ── Window 2: NestJS backend ─────────────────────────────────────────────────
tmux new-window -t $SESSION -n "backend"
tmux send-keys -t "${SESSION}:backend" \
  "cd $ROOT && pnpm --filter @uttt/backend dev" C-m

# ── Window 3: Vite frontend ───────────────────────────────────────────────────
tmux new-window -t $SESSION -n "frontend"
tmux send-keys -t "${SESSION}:frontend" \
  "cd $ROOT && pnpm --filter @uttt/frontend dev" C-m

# ── Window 4: shared watch mode ───────────────────────────────────────────────
tmux new-window -t $SESSION -n "shared"
tmux send-keys -t "${SESSION}:shared" \
  "cd $ROOT && pnpm --filter @uttt/shared dev" C-m

# ── Focus inference window and attach ────────────────────────────────────────
tmux select-window -t "${SESSION}:inference"
tmux attach -t $SESSION