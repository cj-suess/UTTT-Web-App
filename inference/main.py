# UTTT Inference Service
# loads all three difficulty models at startup and exposes a /move endpoint
# to run locally:
#   uvicorn main:app --reload --port 8000
import os
import logging
import time
from pathlib import Path
from typing import List, Literal, Optional, Tuple

import numpy as np
import torch
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from game_utils import MCTS, UTTTNet, UTTTState

logging.basicConfig(level=logging.INFO, format="[inference] %(message)s")
logger = logging.getLogger("inference")

DEVICE    = os.environ.get("DEVICE", "cuda" if torch.cuda.is_available() else "cpu")
MODEL_DIR = os.environ.get("MODEL_DIR", "models")

# ─── Encoders ─────────────────────────────────────────────────────────────────
# Save the default 7-channel encoder before any potential patching.
_encode_7ch = MCTS._encode_state

def _encode_4ch(state):
    board_flat    = np.array(state.board, dtype=np.float32)
    board_spatial = MCTS._linear_to_spatial(board_flat)
    ch_own  = (board_spatial ==  state.player).astype(np.float32)
    ch_opp  = (board_spatial == -state.player).astype(np.float32)
    ch_turn = np.full((9, 9), state.player, dtype=np.float32)
    mask    = np.zeros(81, dtype=np.float32)
    for m, c in state.get_actions():
        mask[m * 9 + c] = 1.0
    return np.stack([ch_own, ch_opp, ch_turn, MCTS._linear_to_spatial(mask)], axis=0)

# ─── Model loading ────────────────────────────────────────────────────────────
def _load_model(path: str) -> dict:
    loaded = torch.load(path, map_location=DEVICE, weights_only=False)
    if isinstance(loaded, dict) and "model_state_dict" in loaded:
        sd     = loaded["model_state_dict"]
        blocks = loaded.get("arch", {}).get("num_res_blocks", 10)
    elif isinstance(loaded, dict) and "conv1.weight" in loaded:
        sd     = loaded
        blocks = 10
    else:
        raise RuntimeError(f"Unrecognised checkpoint format in {path}")

    channels    = sd["conv1.weight"].shape[0]
    in_channels = sd["conv1.weight"].shape[1]

    net = UTTTNet(channels=channels, num_res_blocks=blocks,
                  in_channels=in_channels).to(DEVICE)
    net.load_state_dict(sd)
    net.eval()

    encoder = _encode_4ch if in_channels == 4 else _encode_7ch
    print(f"[inference]   {Path(path).stem}: {channels}ch / {in_channels}-input")
    return {"net": net, "encoder": encoder, "channels": channels, "in_channels": in_channels}


print(f"[inference] Loading models from {MODEL_DIR}/ on {DEVICE}...")
_models: dict = {}
for _difficulty in ("easy", "medium", "hard"):
    _models[_difficulty] = _load_model(f"{MODEL_DIR}/{_difficulty}.pth")
print("[inference] All models ready.")


app = FastAPI(title="UTTT Inference", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# DTOs
class GameStateDTO(BaseModel):
    board:      List[int] = Field(..., min_length=81, max_length=81,
                                  description="81 cells, macro-major order. 1=X, -1=O, 0=empty.")
    macro:      List[int] = Field(..., min_length=9, max_length=9,
                                  description="9 macro-cells. 1=X won, -1=O won, 2=draw, 0=open.")
    player:     int       = Field(..., description="Whose turn: 1 (X) or -1 (O).")
    next_micro: Optional[int] = Field(None, ge=0, le=8,
                                      description="Constrained micro-board (0-8), or null for free.")


class MoveAnalysis(BaseModel):
    move:        Tuple[int, int]
    visits:      int
    visit_share: float
    q_value:     float
    prior:       float
    is_best:     bool


class MoveResponse(BaseModel):
    best_move:           Tuple[int, int]
    candidates:          List[MoveAnalysis]
    value_estimate:      float
    search_value:        float
    principal_variation: List[Tuple[int, int]]
    sims_used:           int


class MoveRequest(BaseModel):
    state:      GameStateDTO
    sims:       int = Field(800, ge=1, le=10000, description="MCTS simulations per move.")
    difficulty: Literal["easy", "medium", "hard"] = "hard"


# helpers
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
    """Walk down the most-visited child to produce an expected line."""
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


# endpoints
@app.get("/health")
def health():
    return {
        "status":  "ok",
        "device":  DEVICE,
        "models":  {d: f"{_models[d]['channels']}ch / {_models[d]['in_channels']}-input"
                    for d in _models},
    }


@app.post("/move", response_model=MoveResponse)
def get_move(req: MoveRequest):
    state = state_from_dto(req.state)
    if state.is_terminal():
        raise HTTPException(status_code=400, detail="Game is already terminal.")
    if not state.get_actions():
        raise HTTPException(status_code=400, detail="No legal moves available.")

    model = _models[req.difficulty]

    # Patch the class-level encoder before constructing MCTS.
    # Safe: Python's GIL and synchronous search mean only one request runs at a time.
    MCTS._encode_state = staticmethod(model["encoder"])

    start = time.time()
    mcts = MCTS(model["net"], num_sims=req.sims, c_puct=1.0, device=DEVICE)
    visit_probs = mcts.search(state)

    elapsed = time.time() - start
    logger.info(f"[{req.difficulty}] MCTS: {req.sims} sims in {elapsed:.2f}s")

    root_key = state.to_key()

    best_idx  = int(np.argmax(visit_probs))
    best_move = (best_idx // 9, best_idx % 9)

    total_visits = mcts.Ns.get(root_key, req.sims)
    priors       = mcts.Ps.get(root_key, np.zeros(81))
    candidates: List[MoveAnalysis] = []

    for action in state.get_actions():
        idx    = action[0] * 9 + action[1]
        sa_key = (root_key, idx)
        visits = mcts.Nsa.get(sa_key, 0)
        q_sum  = mcts.Qsa.get(sa_key, 0.0)
        candidates.append(
            MoveAnalysis(
                move=action,
                visits=visits,
                visit_share=visits / max(total_visits, 1),
                q_value=float(q_sum / visits) if visits > 0 else 0.0,
                prior=float(priors[idx]),
                is_best=(action == best_move),
            )
        )
    candidates.sort(key=lambda c: c.visits, reverse=True)

    result = MoveResponse(
        best_move=best_move,
        candidates=candidates,
        value_estimate=float(mcts.Vs.get(root_key, 0.0)),
        search_value=float(
            sum(mcts.Qsa.get((root_key, a[0]*9+a[1]), 0.0) for a in state.get_actions()) /
            max(sum(mcts.Nsa.get((root_key, a[0]*9+a[1]), 0) for a in state.get_actions()), 1)
        ),
        principal_variation=compute_principal_variation(mcts, state),
        sims_used=req.sims,
    )

    logger.info(f"Best move: macro={result.best_move[0]} cell={result.best_move[1]}")
    logger.info(f"Value estimate: {result.value_estimate:.3f}  "
                f"Win probability: {(result.value_estimate + 1) / 2:.1%}")
    logger.info(f"Principal variation: {result.principal_variation}")
    logger.info("Top candidates:")
    for c in result.candidates[:5]:
        logger.info(
            f"  move={c.move}  visits={c.visits} ({c.visit_share:.1%})"
            f"  q={c.q_value:.3f}  prior={c.prior:.4f}  best={c.is_best}"
        )

    return result
