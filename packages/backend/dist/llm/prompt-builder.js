"use strict";
/**
 * Prompt builder for the UTTT learning feature.
 *
 * Translates GameState + GameAnalysis into a structured, human-readable
 * context string for Claude Haiku. The goal is to give the LLM everything
 * it needs to explain one recommended move — immediate reason AND long-term
 * reasoning — without exceeding the balanced token tier (~450 input tokens).
 *
 * Uses cached analysis from the AI's last move (Option B): PV[1] is X's
 * recommended response, derived from the AI's own search tree.
 *
 * ─── FUTURE IMPROVEMENT NOTE ─────────────────────────────────────────────
 * Currently we lack two things that would improve explanation depth:
 *
 *   1. A ranking of X's candidate moves (not just the single PV[1] recommendation).
 *      This would require running a fresh MCTS search from X's current position.
 *
 *   2. Intermediate win probabilities at each step of the principal variation
 *      (e.g. "after move 3 you'd be at 68%"). Getting those requires running
 *      MCTS at each PV position — expensive but potentially distributable
 *      across workers, similar to the training setup.
 *
 * Revisit if the LLM explanations feel too shallow or lack long-term depth.
 * ─────────────────────────────────────────────────────────────────────────
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SYSTEM_PROMPT = void 0;
exports.buildHintPrompt = buildHintPrompt;
// ─── Position naming ──────────────────────────────────────────────────────────
const POSITION = {
    0: 'top-left',
    1: 'top-center',
    2: 'top-right',
    3: 'center-left',
    4: 'center',
    5: 'center-right',
    6: 'bottom-left',
    7: 'bottom-center',
    8: 'bottom-right',
};
// ─── System prompt ────────────────────────────────────────────────────────────
exports.SYSTEM_PROMPT = `You are an expert Ultimate Tic-Tac-Toe (UTTT) coach explaining moves to a beginner.

UTTT is played on a 9x9 grid divided into nine 3x3 micro-boards arranged in a 3x3 macro-grid. Players alternate placing X and O. To win a micro-board, get three of your marks in a row within it (horizontally, vertically, or diagonally). To win the game, win three micro-boards in a row on the macro-grid.

The critical constraint: the cell position you play in determines which micro-board your opponent must play in next. Playing in cell N sends your opponent to micro-board N. If that board is already won or drawn, they get a free move anywhere.

Key strategic principles:
- Sending your opponent to a board where they can win it immediately is dangerous
- Sending them to an already-decided board gives them a free move (usually bad for you)
- Winning the center macro-board is particularly powerful
- Think ahead: where does your move send your opponent, and where will their response send you?

The move data comes from a Monte Carlo Tree Search (MCTS) — an algorithm that simulates thousands of possible future game sequences from the current position. A move with 80%+ of simulations means the AI found that all other options led to significantly worse long-term outcomes after exhaustive analysis.

Explain the recommended move in 2-3 clear, beginner-friendly sentences. Cover both why it is strong right now AND what long-term advantage it creates or preserves.`;
// ─── Helpers ──────────────────────────────────────────────────────────────────
function macroSymbol(v) {
    if (v === 1)
        return 'X';
    if (v === -1)
        return 'O';
    if (v === 2)
        return 'D';
    return '.';
}
function macroStatusLabel(v) {
    if (v === 1)
        return 'won by X';
    if (v === -1)
        return 'won by O';
    if (v === 2)
        return 'drawn — free move';
    return 'open';
}
/**
 * Render the contents of a specific micro-board as a labelled 3x3 grid.
 * Marks the recommended cell with an arrow.
 */
function renderMicroBoard(board, macroIdx, recommendedCell) {
    const base = macroIdx * 9;
    const sym = (i) => {
        const v = board[base + i];
        return v === 1 ? 'X' : v === -1 ? 'O' : '.';
    };
    const rows = [
        `[ ${sym(0)} | ${sym(1)} | ${sym(2)} ]`,
        `[ ${sym(3)} | ${sym(4)} | ${sym(5)} ]`,
        `[ ${sym(6)} | ${sym(7)} | ${sym(8)} ]`,
    ];
    const recommendedRow = Math.floor(recommendedCell / 3);
    rows[recommendedRow]; // += '  ← play here'
    return rows.join('\n');
}
/**
 * Format the principal variation as a readable move sequence.
 *
 * PV index convention (from O's search tree):
 *   PV[0] = AI's move just played (already on the board)
 *   PV[1] = X's recommended response        ← odd indices = human (X)
 *   PV[2] = AI's expected counter            ← even indices = AI (O)
 *   PV[3] = X's next expected move
 *   ...
 */
function formatPrincipalVariation(pv) {
    const lines = [];
    for (let i = 1; i < pv.length; i++) {
        const [macro, cell] = pv[i];
        const actor = i % 2 === 1 ? 'You' : 'AI';
        lines.push(`  ${actor}: ${POSITION[cell].toUpperCase()} cell of the ${POSITION[macro].toUpperCase()} board`);
    }
    return lines.join('\n');
}
/**
 * Convert a Q-value stored from O's perspective to X's win probability (%).
 * Q from O's POV: negative = O losing = X winning.
 * X win prob = (-Q + 1) / 2, mapped to [0, 100].
 */
function xWinPct(qValueFromO) {
    return Math.round((-qValueFromO + 1) / 2 * 100);
}
// ─── Main export ──────────────────────────────────────────────────────────────
/**
 * Build the user-turn message for the hint prompt.
 *
 * @param state    Current game state — it is X's turn (after AI has moved).
 * @param analysis Cached MCTS analysis from the AI's last move.
 * @returns        Formatted context string, or null if data is insufficient.
 */
function buildHintPrompt(state, analysis) {
    const pv = analysis.principalVariation;
    // PV must contain at least X's recommended move (PV[1]).
    if (pv.length < 2)
        return null;
    const humanWinPct = Math.round((1 - analysis.winProbability) * 100);
    // ── Constraint ──────────────────────────────────────────────────────────
    const isFreeMove = state.nextMicro === null || state.macro[state.nextMicro] !== 0;
    const constraintLine = isFreeMove
        ? 'Free move — you can play in any open board.'
        : `You must play in the ${POSITION[state.nextMicro].toUpperCase()} board.`;
    // ── Macro board overview ─────────────────────────────────────────────────
    const m = state.macro;
    const macroGrid = [
        `[ ${macroSymbol(m[0])} | ${macroSymbol(m[1])} | ${macroSymbol(m[2])} ]`,
        `[ ${macroSymbol(m[3])} | ${macroSymbol(m[4])} | ${macroSymbol(m[5])} ]`,
        `[ ${macroSymbol(m[6])} | ${macroSymbol(m[7])} | ${macroSymbol(m[8])} ]`,
    ].join('\n');
    // ── Recommended move (PV[1] = X's expected best response) ────────────────
    const [xMacro, xCell] = pv[1];
    const destStatus = macroStatusLabel(m[xCell]);
    const bestCandidate = analysis.candidates.find(c => c.isBest);
    const winPctAfterMove = bestCandidate ? xWinPct(bestCandidate.qValue) : humanWinPct;
    // ── Micro-board contents (the board X must play in) ──────────────────────
    // For constrained moves: show the required board.
    // For free moves: show the board containing the recommended move.
    const displayMacro = isFreeMove ? xMacro : state.nextMicro;
    const microBoardLabel = isFreeMove
        ? `The ${POSITION[displayMacro].toUpperCase()} board (recommended target)`
        : `The ${POSITION[displayMacro].toUpperCase()} board (where you must play)`;
    const microBoardGrid = renderMicroBoard(state.board, displayMacro, xCell);
    // ── Full principal variation ──────────────────────────────────────────────
    const pvFormatted = formatPrincipalVariation(pv);
    // ── AI's rejected alternatives ───────────────────────────────────────────
    // These are O's other options from its last turn — showing them explains
    // why O played as it did and what would have happened differently.
    const alternatives = analysis.candidates
        .filter(c => !c.isBest && c.visits > 0)
        .slice(0, 3)
        .map(alt => {
        const [aMacro, aCell] = alt.move;
        const altXWin = xWinPct(alt.qValue);
        return (`  - ${POSITION[aCell].toUpperCase()} cell of ${POSITION[aMacro].toUpperCase()} board: ` +
            `explored ${Math.round(alt.visitShare * 100)}% of the time — ` +
            `would have left you at ~${altXWin}% win probability`);
    })
        .join('\n');
    // ── Assemble ──────────────────────────────────────────────────────────────
    return `Game situation:
- It is your turn (you play as X)
- ${constraintLine}
- Your current win probability: ${humanWinPct}%
- The AI analysed ${analysis.simsUsed} possible future game sequences

Macro board overview (X = won by X, O = won by O, D = drawn, . = open):
${macroGrid}

${microBoardLabel}:
${microBoardGrid}

Recommended move: ${POSITION[xCell].toUpperCase()} cell of the ${POSITION[xMacro].toUpperCase()} board
- Sends the AI to the ${POSITION[xCell].toUpperCase()} board (currently ${destStatus})
- Your win probability after this move: ~${winPctAfterMove}%

Expected game line if both players continue to play optimally:
${pvFormatted}

Other moves the AI considered for its last turn (and why it rejected them):
${alternatives || '  (no meaningful alternatives — position was largely forced)'}

Explain the recommended move in 2-3 clear, beginner-friendly sentences. Cover both why it is strong right now AND what long-term advantage it creates or preserves. Write in plain prose only — do not use any markdown formatting, headers, or bold text.`;
}
//# sourceMappingURL=prompt-builder.js.map