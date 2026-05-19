/**
 * Pure functions implementing the rules of Ultimate Tic-Tac-Toe.
 *
 * Every function is referentially transparent: same input -> same output, no
 * mutation, no side effects. `applyMove` returns a fresh state.
 */
import { GameState, MacroResult, Move } from './types';
/** A fresh game: empty board, X to move, no constraint on first move. */
export declare function initialState(): GameState;
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
export declare function checkWinner3x3(cells: readonly number[]): MacroResult | null;
/** True if the game is over (macro winner exists, or all macros decided). */
export declare function isTerminal(state: GameState): boolean;
/**
 * Game result from X's perspective: +1 if X won, -1 if O won, 0 otherwise.
 *
 * Returns 0 for in-progress games as well — call `isTerminal` first if the
 * distinction between "draw" and "still playing" matters to the caller.
 */
export declare function evaluate(state: GameState): number;
/**
 * List of legal moves from the current state.
 *
 * Respects the "send-to-next-macro" rule: you must play in the macro pointed
 * to by your opponent's last move, unless that macro has already been decided
 * (won or drawn), in which case any open macro is fair game.
 */
export declare function getLegalMoves(state: GameState): Move[];
/** Convenience wrapper — is this specific move legal right now? */
export declare function isLegalMove(state: GameState, move: Move): boolean;
/**
 * Apply a move and return the resulting state.
 *
 * Assumes the move is legal; call `isLegalMove` first if validating
 * untrusted input (which the NestJS controller will, before forwarding to
 * inference).
 */
export declare function applyMove(state: GameState, move: Move): GameState;
