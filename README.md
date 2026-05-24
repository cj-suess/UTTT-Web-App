# UTTT — Ultimate Tic-Tac-Toe vs AlphaZero

Play Ultimate Tic-Tac-Toe against a trained AlphaZero model in the browser. Includes a learning mode that uses Claude to explain the best move and why.

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | 22.12+ | [nodejs.org](https://nodejs.org) or `nvm install 22` |
| pnpm | 9.x+ | `corepack enable && corepack prepare pnpm@latest --activate` |
| Python | 3.10+ | [python.org](https://python.org) or conda |
| tmux | any | `brew install tmux` (macOS) |

---

## Project Structure

```
uttt-web-app/
├── inference/          # Python — FastAPI service wrapping the MCTS model
├── packages/
│   ├── shared/         # TypeScript game rules (used by both backend and frontend)
│   ├── backend/        # NestJS API server
│   └── frontend/       # React + Vite UI
├── package.json
├── pnpm-workspace.yaml
└── run.sh              # Launches all services in a tmux session
```

---

## First-Time Setup

### 1. Install JavaScript dependencies

```bash
pnpm install
pnpm --filter @uttt/shared build
```

### 2. Set up the Python inference service

```bash
cd inference
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 3. Add your trained model

Copy your exported model checkpoint into `inference/models/`:

```bash
mkdir -p inference/models
cp /path/to/your/playable.pth inference/models/best_model.pth
```

The model path is configured in `inference/main.py` via the `MODEL_PATH` variable.

### 4. Add your Anthropic API key (for the hint feature)

Create `packages/backend/.env`:

```
ANTHROPIC_API_KEY=your_key_here
```

Get a key at [console.anthropic.com](https://console.anthropic.com). The hint feature uses Claude Haiku — roughly $0.001 per hint request.

---

## Running the App

```bash
./run.sh
```

This builds `@uttt/shared`, then opens a tmux session with four windows:

| Window | Command | URL |
|--------|---------|-----|
| `inference` | uvicorn (FastAPI) | `http://localhost:8000` |
| `backend` | NestJS | `http://localhost:3000` |
| `frontend` | Vite | `http://localhost:5173` |
| `shared` | tsc --watch | — |

Open `http://localhost:5173` in your browser.

**tmux navigation:** `Ctrl+b 1/2/3/4` to switch windows · `Ctrl+b d` to detach · `tmux attach -t uttt-dev` to reattach.

To stop everything: `tmux kill-session -t uttt-dev`

---

## How to Play

1. Click **NEW GAME** and enter your name
2. You play as **X** (gold) — the AI plays as **O** (blue)
3. Click any highlighted cell to make your move
4. The AI responds automatically

### UTTT Rules (quick version)

- The board is a 3×3 grid of nine 3×3 micro-boards
- Win a micro-board by getting three in a row within it
- Win the game by winning three micro-boards in a row
- **The key rule:** the cell you play in sends your opponent to that micro-board next turn
- If you're sent to an already-decided board, you get a free move anywhere

### Learning Mode

After the AI makes its first move, a **GET HINT** button appears in the right panel on your turn. Click it to get a plain-English explanation of the best move and why based on the MCTS analysis.

---

## Configuration

### AI strength (number of simulations)

Edit `AI_SIMS` in `packages/frontend/src/api/client.ts`:

```typescript
const AI_SIMS = 400   // increase for stronger play, decrease for faster responses
```

Vite hot-reloads on save — no restart needed.

### Swapping models

Change the `MODEL_PATH` in `inference/main.py` and save. Uvicorn's `--reload` flag detects the change and reloads the model automatically.

To export a slim model from a training checkpoint (drops the replay buffer):

```bash
python3 -c "
import torch
d = torch.load('models/best_model.pth', map_location='cpu')
torch.save(d['model_state_dict'], 'models/playable.pth')
"
```

---

## Rebuilding shared after edits

The `run.sh` script keeps `@uttt/shared` in watch mode (window 4), so changes rebuild automatically while the session is running. If you edit shared outside a session:

```bash
pnpm --filter @uttt/shared build
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Model | PyTorch — AlphaZero-style ResNet (10 blocks, 128 channels) |
| Inference | FastAPI + MCTS |
| Backend | NestJS (TypeScript) |
| Frontend | React + Vite (TypeScript) |
| Shared logic | TypeScript package (`@uttt/shared`) |
| LLM hints | Anthropic Claude Haiku |