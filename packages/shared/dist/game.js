"use strict";
/**
 * Pure functions implementing the rules of Ultimate Tic-Tac-Toe.
 *
 * Every function is referentially transparent: same input -> same output, no
 * mutation, no side effects. `applyMove` returns a fresh state.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.initialState = initialState;
exports.checkWinner3x3 = checkWinner3x3;
exports.isTerminal = isTerminal;
exports.evaluate = evaluate;
exports.getLegalMoves = getLegalMoves;
exports.isLegalMove = isLegalMove;
exports.applyMove = applyMove;
const types_1 = require("./types");
/** A fresh game: empty board, X to move, no constraint on first move. */
function initialState() {
    return {
        board: new Array(81).fill(types_1.EMPTY),
        macro: new Array(9).fill(types_1.EMPTY),
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
function checkWinner3x3(cells) {
    for (const [a, b, c] of types_1.WIN_LINES) {
        const v = cells[a];
        if (v !== 0 && v !== 2 && v === cells[b] && v === cells[c]) {
            return v;
        }
    }
    if (cells.every(v => v !== 0))
        return types_1.DRAW;
    return null;
}
/** True if the game is over (macro winner exists, or all macros decided). */
function isTerminal(state) {
    if (checkWinner3x3(state.macro) !== null)
        return true;
    return state.macro.every(v => v !== 0);
}
/**
 * Game result from X's perspective: +1 if X won, -1 if O won, 0 otherwise.
 *
 * Returns 0 for in-progress games as well — call `isTerminal` first if the
 * distinction between "draw" and "still playing" matters to the caller.
 */
function evaluate(state) {
    const winner = checkWinner3x3(state.macro);
    if (winner === 1)
        return 1;
    if (winner === -1)
        return -1;
    return 0;
}
/**
 * List of legal moves from the current state.
 *
 * Respects the "send-to-next-macro" rule: you must play in the macro pointed
 * to by your opponent's last move, unless that macro has already been decided
 * (won or drawn), in which case any open macro is fair game.
 */
function getLegalMoves(state) {
    // Decide which macros are even candidates.
    let candidateMacros;
    if (state.nextMicro === null || state.macro[state.nextMicro] !== 0) {
        candidateMacros = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    }
    else {
        candidateMacros = [state.nextMicro];
    }
    const moves = [];
    for (const m of candidateMacros) {
        if (state.macro[m] !== 0)
            continue; // skip decided macros
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
function isLegalMove(state, move) {
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
function applyMove(state, move) {
    const [m, c] = move;
    const idx = m * 9 + c;
    // Place the stone on a copy of the board.
    const newBoard = state.board.slice();
    newBoard[idx] = state.player;
    // Did this complete the micro-board? Only update macro if it was open.
    const microCells = newBoard.slice(m * 9, m * 9 + 9);
    const microResult = checkWinner3x3(microCells);
    const newMacro = state.macro.slice();
    if (microResult !== null && newMacro[m] === 0) {
        newMacro[m] = microResult;
    }
    // The opponent is sent to the macro matching the cell we just played in;
    // but if that macro is already decided, they get a free move instead.
    let nextMicro = c;
    if (newMacro[nextMicro] !== 0)
        nextMicro = null;
    return {
        board: newBoard,
        macro: newMacro,
        player: -state.player,
        nextMicro,
    };
}
//# sourceMappingURL=game.js.map