/**
 * Type definitions and constants for Ultimate Tic-Tac-Toe.
 *
 * These mirror the Python data model in `game_utils.py` exactly. The cell
 * encoding (1 = X, -1 = O, 0 = empty, 2 = draw-in-macro), the 81-element
 * macro-major board layout, and the `nextMicro` semantics are all preserved
 * so that the same JSON state can flow between the inference service, this
 * backend, and the frontend without any reinterpretation.
 */

/** Whose turn it is. 1 = X, -1 = O. */
export type Player = 1 | -1;

/** Contents of a single cell on the 81-cell board. */
export type Cell = 0 | 1 | -1;

/** Outcome of a macro-board: 0 = open, 1 = X won, -1 = O won, 2 = drawn. */
export type MacroResult = 0 | 1 | -1 | 2;

/**
 * A move, expressed as [macroIndex, cellIndex], both 0-8.
 *
 * Macro-major order means the global board index is `macro * 9 + cell`.
 * Using a tuple (rather than an object) matches the wire format that the
 * Python inference service emits, so no field-name translation is needed
 * when forwarding the model's chosen move to the frontend.
 */
export type Move = readonly [macro: number, cell: number];

/**
 * Full game state. Treated as immutable everywhere — any function that
 * "changes" state returns a new object rather than mutating its input.
 *
 * - `board[m * 9 + c]` is the contents of micro-board `m`, cell `c`
 * - `macro[m]` is the outcome of micro-board `m`
 * - `player` is who moves next
 * - `nextMicro` is the macro the next move MUST be played in;
 *   `null` means "play in any open macro" (a free move)
 */
export interface GameState {
  readonly board: readonly Cell[];        // length 81
  readonly macro: readonly MacroResult[]; // length 9
  readonly player: Player;
  readonly nextMicro: number | null;
}

// --- Named constants for readability ------------------------------------

export const X: Player = 1;
export const O: Player = -1;
export const EMPTY = 0 as const;
export const DRAW = 2 as const;

/** All eight winning lines on a 3x3 grid (rows, columns, diagonals). */
export const WIN_LINES: readonly (readonly [number, number, number])[] = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],   // rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8],   // columns
  [0, 4, 8], [2, 4, 6],              // diagonals
];