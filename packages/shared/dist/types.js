"use strict";
/**
 * Type definitions and constants for Ultimate Tic-Tac-Toe.
 *
 * These mirror the Python data model in `game_utils.py` exactly. The cell
 * encoding (1 = X, -1 = O, 0 = empty, 2 = draw-in-macro), the 81-element
 * macro-major board layout, and the `nextMicro` semantics are all preserved
 * so that the same JSON state can flow between the inference service, this
 * backend, and the frontend without any reinterpretation.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.WIN_LINES = exports.DRAW = exports.EMPTY = exports.O = exports.X = void 0;
// --- Named constants for readability ------------------------------------
exports.X = 1;
exports.O = -1;
exports.EMPTY = 0;
exports.DRAW = 2;
/** All eight winning lines on a 3x3 grid (rows, columns, diagonals). */
exports.WIN_LINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // columns
    [0, 4, 8], [2, 4, 6], // diagonals
];
//# sourceMappingURL=types.js.map