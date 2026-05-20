/**
 * Typed API client for the UTTT backend.
 *
 * Pure functions — no React, no state, no side effects beyond the network
 * call. Every function throws on non-OK responses so callers (the hook)
 * can handle errors in one place.
 *
 * The /api prefix is stripped by the Vite dev proxy and forwarded to
 * http://localhost:3000, so these paths match the NestJS routes exactly.
 */

import type { GameState, Move } from '@uttt/shared';

// ─── Response types ──────────────────────────────────────────────────────────
// These mirror the shapes returned by the NestJS controllers.

export interface CandidateMove {
  move: [number, number];
  visits: number;
  visitShare: number;
  qValue: number;
  prior: number;
  isBest: boolean;
}

export interface GameAnalysis {
  bestMove: [number, number];
  candidates: CandidateMove[];
  valueEstimate: number;
  winProbability: number;
  principalVariation: [number, number][];
  simsUsed: number;
}

export interface GameResponse {
  id: string;
  state: GameState;
  createdAt: string;
  // lastAnalysis exists on the backend but is snake_case (internal format).
  // Always use getAnalysis() for typed, camelCase analysis data.
  lastAnalysis: object | null;
}

// ─── Fetch helper ─────────────────────────────────────────────────────────────

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(body.message ?? `Request failed: ${res.status}`);
  }

  return res.json() as Promise<T>;
}

// ─── Endpoints ───────────────────────────────────────────────────────────────

const AI_SIMS = 400;

export const api = {
  /** POST /games — create a new game. */
  createGame: () =>
    request<GameResponse>('/games', { method: 'POST' }),

  /** GET /games/:id — fetch the current game state. */
  getGame: (id: string) =>
    request<GameResponse>(`/games/${id}`),

  /** POST /games/:id/moves — apply a human move. */
  playMove: (id: string, move: Move) =>
    request<GameResponse>(`/games/${id}/moves`, {
      method: 'POST',
      body: JSON.stringify({ move }),
    }),

  /** POST /games/:id/ai-move — run MCTS and apply the AI's move. */
  aiMove: (id: string, sims = AI_SIMS) =>
    request<GameResponse>(`/games/${id}/ai-move?sims=${sims}`, {
      method: 'POST',
    }),

  /** GET /games/:id/analysis — get camelCase MCTS analysis for the last AI move. */
  getAnalysis: (id: string) =>
    request<GameAnalysis>(`/games/${id}/analysis`),
};