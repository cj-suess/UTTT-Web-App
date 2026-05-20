/**
 * useGame — the single source of truth for active game state.
 *
 * Encapsulates all async operations (create, human move, AI move, analysis)
 * so that components deal only with data and callbacks, never with fetch.
 *
 * The game loop for a human move is:
 *   1. POST the human's move  → update board
 *   2. If game over, stop.
 *   3. POST ai-move           → update board again
 *   4. GET analysis           → store MCTS readout for learning mode
 */

import { useState } from 'react';
import { isTerminal } from '@uttt/shared';
import type { Move } from '@uttt/shared';
import { api } from '../api/client';
import type { GameAnalysis, GameResponse } from '../api/client';

interface State {
  game: GameResponse | null;
  analysis: GameAnalysis | null;
  loading: boolean;
  error: string | null;
}

const INITIAL: State = {
  game: null,
  analysis: null,
  loading: false,
  error: null,
};

export function useGame() {
  const [state, setState] = useState<State>(INITIAL);

  // ─── Helpers ───────────────────────────────────────────────────────────────

  function begin() {
    setState(s => ({ ...s, loading: true, error: null }));
  }

  function fail(e: unknown) {
    setState(s => ({
      ...s,
      loading: false,
      error: e instanceof Error ? e.message : 'Something went wrong.',
    }));
  }

  // ─── Actions ───────────────────────────────────────────────────────────────

  /** Create a fresh game and reset all state. */
  async function createGame() {
    begin();
    try {
      const game = await api.createGame();
      setState({ game, analysis: null, loading: false, error: null });
    } catch (e) {
      fail(e);
    }
  }

  /**
   * Apply a human move, then let the AI respond.
   *
   * Both the human and AI moves hit separate endpoints so the UI can update
   * the board twice (immediately after the human move, then again after AI),
   * giving the user visible feedback while MCTS runs.
   */
  async function playMove(move: Move) {
    const { game, loading } = state;
    if (!game || loading) return;

    begin();
    try {
      // 1. Human move
      const afterHuman = await api.playMove(game.id, move);
      setState(s => ({ ...s, game: afterHuman }));

      // 2. Did the human just win?
      if (isTerminal(afterHuman.state)) {
        setState(s => ({ ...s, loading: false }));
        return;
      }

      // 3. AI responds (board update happens here)
      const afterAi = await api.aiMove(game.id);
      setState(s => ({ ...s, game: afterAi }));

      // 4. Fetch and cache analysis — always available after AI moves.
      //    Works even if the AI just played the winning move.
      const analysis = await api.getAnalysis(game.id);
      setState(s => ({ ...s, analysis, loading: false }));
    } catch (e) {
      fail(e);
    }
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  return {
    game: state.game,
    analysis: state.analysis,
    loading: state.loading,
    error: state.error,
    createGame,
    playMove,
  };
}