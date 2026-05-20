"""
UTTT inference service.

Wraps the trained AlphaZero model and exposes a /move endpoint that returns
not just the best move but the full MCTS readout needed for learning mode:
visit counts, Q-values, policy priors, principal variation, value estimate.

Run locally with:
    uvicorn main:app --reload --port 8000
"""

import os
from typing import List, Optional, Tuple

import numpy as np
import torch
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from game_utils import MCTS, UTTTNet, UTTTState

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
DEVICE = os.environ.get("DEVICE", "cuda" if torch.cuda.is_available() else "cpu")
MODEL_PATH = os.environ.get("MODEL_PATH", "models/playable-2.pth")
CHANNELS = int(os.environ.get("CHANNELS", "128"))
NUM_RES_BLOCKS = int(os.environ.get("NUM_RES_BLOCKS", "10"))

# ---------------------------------------------------------------------------
# Model loading (once, at startup)
# ---------------------------------------------------------------------------
print(f"[inference] Loading model from {MODEL_PATH} on {DEVICE}...")
nnet = UTTTNet(channels=CHANNELS, num_res_blocks=NUM_RES_BLOCKS).to(DEVICE)
_loaded = torch.load(MODEL_PATH, map_location=DEVICE, weights_only=False)

# Accept either a full training checkpoint (dict with 'model_state_dict') or
# a slim playable (raw state_dict, as produced by your export one-liner).
if isinstance(_loaded, dict) and "model_state_dict" in _loaded:
    nnet.load_state_dict(_loaded["model_state_dict"])
    MODEL_ITERATION = _loaded.get("iteration", None)
else:
    nnet.load_state_dict(_loaded)
    MODEL_ITERATION = None
nnet.eval()
print(f"[inference] Model loaded (iteration: {MODEL_ITERATION if MODEL_ITERATION is not None else 'unknown'})")

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(title="UTTT Inference", version="0.1.0")

# Permissive CORS for local dev. Tighten this for production.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# DTOs
# ---------------------------------------------------------------------------
class GameStateDTO(BaseModel):
    """Client representation of a UTTT state."""
    board: List[int] = Field(..., min_length=81, max_length=81,
                             description="81 cells, macro-major order. 1=X, -1=O, 0=empty.")
    macro: List[int] = Field(..., min_length=9, max_length=9,
                             description="9 macro-cells. 1=X won, -1=O won, 2=draw, 0=open.")
    player: int = Field(..., description="Whose turn: 1 (X) or -1 (O).")
    next_micro: Optional[int] = Field(None, ge=0, le=8,
                                      description="Constrained micro-board (0-8), or null for free.")


class MoveAnalysis(BaseModel):
    """Per-move breakdown the frontend uses to render the learning overlay."""
    move: Tuple[int, int]       # (macro, cell), both 0-8
    visits: int                 # MCTS visit count for this action at root
    visit_share: float          # visits / total_root_simulations
    q_value: float              # MCTS-derived expected value, in [-1, 1], from current player's POV
    prior: float                # raw policy-head probability for this move
    is_best: bool               # the move the agent would actually play


class MoveResponse(BaseModel):
    best_move: Tuple[int, int]
    candidates: List[MoveAnalysis]   # all legal moves, sorted by visits desc
    value_estimate: float            # value head's read on the current position, [-1, 1]
    principal_variation: List[Tuple[int, int]]  # expected line going forward
    sims_used: int


class MoveRequest(BaseModel):
    state: GameStateDTO
    sims: int = Field(800, ge=1, le=4000, description="MCTS simulations per move.")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def state_from_dto(dto: GameStateDTO) -> UTTTState:
    return UTTTState(
        board=tuple(dto.board),
        macro=tuple(dto.macro),
        player=dto.player,
        next_micro=dto.next_micro,
    )


def compute_principal_variation(
    mcts: MCTS, root_state: UTTTState, max_depth: int = 8
) -> List[Tuple[int, int]]:
    """Walk down the most-visited child to produce an expected line.

    Stops when we leave the explored part of the tree or hit a terminal state.
    """
    pv: List[Tuple[int, int]] = []
    state = root_state
    for _ in range(max_depth):
        if state.is_terminal():
            break
        key = state.to_key()
        if key not in mcts.Ps:
            break
        best_action: Optional[Tuple[int, int]] = None
        best_visits = -1
        for action in state.get_actions():
            idx = action[0] * 9 + action[1]
            visits = mcts.Nsa.get((key, idx), 0)
            if visits > best_visits:
                best_visits = visits
                best_action = action
        if best_action is None or best_visits <= 0:
            break
        pv.append(best_action)
        state = state.apply(best_action)
    return pv


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@app.get("/health")
def health():
    return {
        "status": "ok",
        "device": DEVICE,
        "model_path": MODEL_PATH,
        "iteration": MODEL_ITERATION,
    }


@app.post("/move", response_model=MoveResponse)
def get_move(req: MoveRequest):
    state = state_from_dto(req.state)
    if state.is_terminal():
        raise HTTPException(status_code=400, detail="Game is already terminal.")
    if not state.get_actions():
        raise HTTPException(status_code=400, detail="No legal moves available.")

    # Fresh MCTS per request — never share search trees across users/games.
    mcts = MCTS(nnet, num_sims=req.sims, c_puct=1.0, device=DEVICE)
    visit_probs = mcts.search(state)

    root_key = state.to_key()

    # Best move = argmax visit count (standard AlphaZero play-time choice).
    best_idx = int(np.argmax(visit_probs))
    best_move = (best_idx // 9, best_idx % 9)

    # Build per-move analysis for every legal move.
    total_visits = mcts.Ns.get(root_key, req.sims)
    candidates: List[MoveAnalysis] = []
    priors = mcts.Ps.get(root_key, np.zeros(81))
    for action in state.get_actions():
        idx = action[0] * 9 + action[1]
        sa_key = (root_key, idx)
        visits = mcts.Nsa.get(sa_key, 0)
        q_total = mcts.Qsa.get(sa_key, 0.0)
        # Qsa at root is accumulated value from CURRENT player's POV
        # (the value returned to the root before the per-level sign flip).
        q_value = q_total / visits if visits > 0 else 0.0
        candidates.append(
            MoveAnalysis(
                move=action,
                visits=visits,
                visit_share=visits / max(total_visits, 1),
                q_value=float(q_value),
                prior=float(priors[idx]),
                is_best=(action == best_move),
            )
        )
    candidates.sort(key=lambda c: c.visits, reverse=True)

    return MoveResponse(
        best_move=best_move,
        candidates=candidates,
        value_estimate=float(mcts.Vs.get(root_key, 0.0)),
        principal_variation=compute_principal_variation(mcts, state),
        sims_used=req.sims,
    )