/**
 * Pure functions implementing the rules of Ultimate Tic-Tac-Toe.
 *
 * Every function is referentially transparent: same input -> same output, no
 * mutation, no side effects. `applyMove` returns a fresh state.
 */

import {
  Cell,
  DRAW,
  EMPTY,
  GameState,
  MacroResult,
  Move,
  Player,
  WIN_LINES,
} from './types';

/** A fresh game: empty board, X to move, no constraint on first move. */
export function initialState(): GameState {
  return {
    board: new Array(81).fill(EMPTY) as Cell[],
    macro: new Array(9).fill(EMPTY) as MacroResult[],
    player: 1,
    nextMicro: null,
  };
}

/**
 * Check a 3x3 cell array for an outcome.
 *
 * Returns the winning player (1 or -1) if someone has three in a row,
 * `DRAW` (2) if every cell is filled but no one won,
 * or `null` if the game is still open.
 *
 * Cells holding the draw marker (2) are intentionally NOT eligible to form a
 * winning line — that's why the check has `v !== 2` alongside `v !== 0`.
 * This matters at the macro level: a drawn micro-board doesn't help anyone.
 */
export function checkWinner3x3(cells: readonly number[]): MacroResult | null {
  for (const [a, b, c] of WIN_LINES) {
    const v = cells[a];
    if (v !== 0 && v !== 2 && v === cells[b] && v === cells[c]) {
      return v as MacroResult;
    }
  }
  if (cells.every(v => v !== 0)) return DRAW;
  return null;
}

/** True if the game is over (macro winner exists, or all macros decided). */
export function isTerminal(state: GameState): boolean {
  if (checkWinner3x3(state.macro) !== null) return true;
  return state.macro.every(v => v !== 0);
}

/**
 * Game result from X's perspective: +1 if X won, -1 if O won, 0 otherwise.
 *
 * Returns 0 for in-progress games as well — call `isTerminal` first if the
 * distinction between "draw" and "still playing" matters to the caller.
 */
export function evaluate(state: GameState): number {
  const winner = checkWinner3x3(state.macro);
  if (winner === 1) return 1;
  if (winner === -1) return -1;
  return 0;
}

/**
 * List of legal moves from the current state.
 *
 * Respects the "send-to-next-macro" rule: you must play in the macro pointed
 * to by your opponent's last move, unless that macro has already been decided
 * (won or drawn), in which case any open macro is fair game.
 */
export function getLegalMoves(state: GameState): Move[] {
  // Decide which macros are even candidates.
  let candidateMacros: number[];
  if (state.nextMicro === null || state.macro[state.nextMicro] !== 0) {
    candidateMacros = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  } else {
    candidateMacros = [state.nextMicro];
  }

  const moves: Move[] = [];
  for (const m of candidateMacros) {
    if (state.macro[m] !== 0) continue;          // skip decided macros
    const base = m * 9;
    for (let c = 0; c < 9; c++) {
      if (state.board[base + c] === 0) {
        moves.push([m, c]);
      }
    }
  }
  return moves;
}

/** Convenience wrapper — is this specific move legal right now? */
export function isLegalMove(state: GameState, move: Move): boolean {
  const [m, c] = move;
  return getLegalMoves(state).some(([m2, c2]) => m === m2 && c === c2);
}

/**
 * Apply a move and return the resulting state.
 *
 * Assumes the move is legal; call `isLegalMove` first if validating
 * untrusted input (which the NestJS controller will, before forwarding to
 * inference).
 */
export function applyMove(state: GameState, move: Move): GameState {
  const [m, c] = move;
  const idx = m * 9 + c;

  // Place the stone on a copy of the board.
  const newBoard = state.board.slice() as Cell[];
  newBoard[idx] = state.player;

  // Did this complete the micro-board? Only update macro if it was open.
  const microCells = newBoard.slice(m * 9, m * 9 + 9);
  const microResult = checkWinner3x3(microCells);
  const newMacro = state.macro.slice() as MacroResult[];
  if (microResult !== null && newMacro[m] === 0) {
    newMacro[m] = microResult;
  }

  // The opponent is sent to the macro matching the cell we just played in;
  // but if that macro is already decided, they get a free move instead.
  let nextMicro: number | null = c;
  if (newMacro[nextMicro] !== 0) nextMicro = null;

  return {
    board: newBoard,
    macro: newMacro,
    player: -state.player as Player,
    nextMicro,
  };
}