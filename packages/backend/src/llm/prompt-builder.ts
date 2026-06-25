/**
 * Prompt builder for the UTTT learning feature.
 *
 * Translates GameState + GameAnalysis into a structured, human-readable
 * context string for Claude Haiku.
 *
 * Uses cached analysis from the AI's last move (Option B): PV[1] is X's
 * recommended response, derived from the AI's own search tree.
 *
 * ─── PENDING BACKEND CHANGES ──────────────────────────────────────────────
 * This file references the following new fields on GameAnalysis that must be
 * added to games.service.ts and (where noted) to main.py:
 *
 *   networkValue: number         — raw network output before search (rename
 *                                  of current valueEstimate; already available)
 *   searchValue: number          — visit-weighted mean Q at root; requires
 *                                  a new field in main.py MoveResponse
 *   positionType: PositionType   — computed in games.service.ts from the above
 *   priorOnBestMove: number      — best candidate's prior; computable in
 *                                  games.service.ts from candidates array
 *   topMoveVisitShare: number    — best candidate's visitShare; same source
 *   macroThreats: MacroThreatContext — computed in games.service.ts from
 *                                  GameState + PV[1]
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { GameState } from '@uttt/shared';
import type {
  GameAnalysis,
  MacroThreatContext,
  PositionType,
  MoveStrategy,
  ConstraintAnalysis,
} from '../games/games.service';

// ─── Position naming ──────────────────────────────────────────────────────────

const POSITION: Record<number, string> = {
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

export const SYSTEM_PROMPT = `You are an expert Ultimate Tic-Tac-Toe (UTTT) coach explaining moves to a beginner.

UTTT is played on a 9x9 grid divided into nine 3x3 micro-boards arranged in a 3x3 macro-grid. Players alternate placing X and O. To win a micro-board, get three of your marks in a row within it (horizontally, vertically, or diagonally). To win the game, win three micro-boards in a row on the macro-grid.

The critical constraint: the cell position you play in determines which micro-board your opponent must play in next. Playing in cell N sends your opponent to micro-board N. If that board is already won or drawn, they get a free move anywhere.

Board status definitions:
- "empty" — no pieces played yet
- "open" — pieces played, no winner yet
- "won by X / O" — that player controls this board
- "drawn" — full with no winner; sends opponent to a free move

Tactical patterns — reference these by name when they apply:
- IMMEDIATE WIN: a move that completes three in a row in a micro-board right now; always the top priority
- BLOCK: prevents the opponent from completing three in a row in a micro-board on their next turn
- FORK: creates two simultaneous winning threats in the same micro-board; the opponent can only block one
- FORK BLOCK: prevents the opponent from creating a fork by occupying the cell they would need
- CENTER CONTROL: the center cell of a micro-board (middle position) is the most powerful square in tic-tac-toe because it participates in four winning lines
- CORNER PLAY: corners participate in three winning lines each and are the second-strongest positions

UTTT constraint strategy:
- Every move sends your opponent to a specific micro-board — this constraint is as important as the move itself
- Sending your opponent to a board where they can win immediately is usually a mistake
- Sending them to a completed board gives them a free move anywhere, which is dangerous unless all boards are roughly equal
- Sending them to a board where you already have winning threats forces them to defend rather than attack

The move data comes from a strong Monte Carlo Tree Search (MCTS) model. Write in plain prose only — no markdown, headers, or bold text.`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function macroSymbol(v: number): string {
  if (v === 1)  return 'X';
  if (v === -1) return 'O';
  if (v === 2)  return 'D';
  return '.';
}

function boardStatusLabel(macroValue: number, count: number): string {
  if (macroValue === 1)  return 'won by X';
  if (macroValue === -1) return 'won by O';
  if (macroValue === 2)  return 'drawn — free move';
  return count === 0 ? 'empty' : `open (${count} piece${count !== 1 ? 's' : ''} played)`;
}

function pieceCount(board: readonly number[], macroIdx: number): number {
  const base = macroIdx * 9;
  let count = 0;
  for (let i = 0; i < 9; i++) {
    if (board[base + i] !== 0) count++;
  }
  return count;
}

/**
 * Render one micro-board as a 3×3 grid, marking the recommended cell with *.
 * The marker replaces the empty dot so the suggested move is unambiguous
 * regardless of which column it falls in.
 */
function renderMicroBoard(
  board: readonly number[],
  macroIdx: number,
  recommendedCell: number,
): string {
  const base = macroIdx * 9;
  const sym = (i: number) => {
    const v = board[base + i];
    if (v === 1)  return 'X';
    if (v === -1) return 'O';
    return i === recommendedCell ? '*' : '.';
  };
  return [
    `[ ${sym(0)} | ${sym(1)} | ${sym(2)} ]`,
    `[ ${sym(3)} | ${sym(4)} | ${sym(5)} ]`,
    `[ ${sym(6)} | ${sym(7)} | ${sym(8)} ]`,
  ].join('\n');
}

/**
 * Render a standalone micro-board grid (no arrow annotation).
 * Used for the full macro board status section.
 */
function renderMicroBoardPlain(
  board: readonly number[],
  macroIdx: number,
): string {
  const base = macroIdx * 9;
  const sym = (i: number) => {
    const v = board[base + i];
    return v === 1 ? 'X' : v === -1 ? 'O' : '.';
  };
  return [
    `  [ ${sym(0)} | ${sym(1)} | ${sym(2)} ]`,
    `  [ ${sym(3)} | ${sym(4)} | ${sym(5)} ]`,
    `  [ ${sym(6)} | ${sym(7)} | ${sym(8)} ]`,
  ].join('\n');
}

/**
 * Render all 9 micro-boards with their status and piece layout.
 * Empty boards show only their label (no grid — all dots conveys nothing).
 * All other boards show the full 3×3 grid so the LLM can see the exact state.
 */
function renderAllMicroBoards(
  board: readonly number[],
  macro: readonly number[],
): string {
  return Array.from({ length: 9 }, (_, i) => {
    const count = pieceCount(board, i);
    const status = boardStatusLabel(macro[i], count);
    const label = `${POSITION[i].toUpperCase()} board — ${status.toUpperCase()}`;

    if (count === 0 && macro[i] === 0) {
      // Empty: no grid needed
      return label;
    }

    // All other boards (open, won, drawn): show the piece layout
    return `${label}:\n${renderMicroBoardPlain(board, i)}`;
  }).join('\n\n');
}

/**
 * Format the principal variation as a readable move sequence.
 *
 * PV index convention (from O's search tree):
 *   PV[0] = AI's move just played (already on the board)
 *   PV[1] = X's recommended response        ← odd indices = human (X)
 *   PV[2] = AI's expected counter            ← even indices = AI (O)
 */
function formatPrincipalVariation(pv: [number, number][]): string {
  const lines: string[] = [];
  for (let i = 1; i < pv.length; i++) {
    const [macro, cell] = pv[i];
    const actor = i % 2 === 1 ? 'You' : 'AI';
    lines.push(
      `  ${actor}: ${POSITION[cell].toUpperCase()} cell of the ${POSITION[macro].toUpperCase()} board`,
    );
  }
  return lines.join('\n');
}

/**
 * Produce a one-line strategy label + plain-language description.
 */
function formatMoveStrategy(strategy: MoveStrategy, boardName: string): string {
  switch (strategy) {
    case 'IMMEDIATE_WIN':
      return `IMMEDIATE WIN — completes three in a row in the ${boardName} board right now.`;
    case 'BLOCK':
      return `BLOCK — prevents O from completing three in a row in the ${boardName} board on their next turn.`;
    case 'FORK':
      return `FORK — creates two simultaneous winning threats in the ${boardName} board. O can only block one.`;
    case 'FORK_BLOCK':
      return `FORK BLOCK — occupies the cell O would need to create a fork in the ${boardName} board.`;
    case 'CENTER_CONTROL':
      return `CENTER CONTROL — the center cell participates in four winning lines, the most powerful square in the ${boardName} board.`;
    case 'CORNER_PLAY':
      return `CORNER PLAY — corners participate in three winning lines each, the second-strongest positions in the ${boardName} board.`;
    case 'POSITIONAL':
      return `POSITIONAL — a long-term move with no immediate tactical threat, chosen for board control and the constraint it creates.`;
  }
}

/**
 * Describe the constraint consequence — where the move sends O.
 */
function formatConstraint(
  constraint: ConstraintAnalysis,
  destBoardName: string,
  destDescription: string,
): string {
  if (constraint.sendsToFreeMove) {
    return (
      `Sends O to the ${destBoardName} board (${destDescription}) — ` +
      `a completed board, so O gets a free move anywhere.`
    );
  }
  if (constraint.sendsToODanger) {
    return (
      `Sends O to the ${destBoardName} board (${destDescription}) — ` +
      `O has an immediate winning threat there. This is a dangerous destination.`
    );
  }
  if (constraint.sendsToXStrong) {
    return (
      `Sends O to the ${destBoardName} board (${destDescription}) — ` +
      `X already has winning threats there, forcing O to defend.`
    );
  }
  return (
    `Sends O to the ${destBoardName} board (${destDescription}) — ` +
    `a neutral destination with no immediate advantage to either player.`
  );
}

/**
 * Q from O's POV → X's win probability (%).
 * Q negative = O losing = X winning.
 */
function xWinPct(qValueFromO: number): number {
  return Math.round((-qValueFromO + 1) / 2 * 100);
}

/**
 * Describe the position type in plain language for the LLM.
 *
 * FORCED   — one move dominated search; explain why there was no real choice.
 * TACTICAL — search overruled the network; explain that calculation was key.
 * STRATEGIC— balanced; explain the long-term reasoning.
 * DESPERATE— X is losing; focus on best defensive resource.
 */
function formatPositionContext(
  positionType: PositionType,
  topMoveVisitShare: number,
  priorOnBestMove: number,
  networkValue: number,
  searchValue: number,
  xWin: number,
): string {
  const topPct    = Math.round(topMoveVisitShare * 100);
  const priorPct  = Math.round(priorOnBestMove * 100);
  const netXPct   = Math.round((-networkValue + 1) / 2 * 100);
  const srchXPct  = Math.round((-searchValue  + 1) / 2 * 100);

  const typeLines: string[] = [];

  switch (positionType) {
    case 'FORCED':
      typeLines.push(
        `Position type: FORCED — ${topPct}% of simulations agreed on this move; alternatives were clearly worse.`,
      );
      break;
    case 'TACTICAL':
      typeLines.push(
        `Position type: TACTICAL — deep calculation overrode pattern recognition.`,
        `  Network initial read: X wins ${netXPct}%  →  Search-refined: X wins ${srchXPct}%`,
        `  The best move was not obvious; it required the AI to look many moves ahead.`,
      );
      break;
    case 'STRATEGIC':
      typeLines.push(
        `Position type: STRATEGIC — a balanced position; several moves were reasonable.`,
        `  The recommended move edges out the alternatives on long-term positional grounds.`,
      );
      break;
    case 'DESPERATE':
      typeLines.push(
        `Position type: DIFFICULT — X has only ${xWin}% winning chances.`,
        `  Focus on the best defensive resource; the position requires damage limitation.`,
      );
      break;
  }

  // Prior on best move — flag when search had to override low-prior moves
  if (priorPct < 5) {
    typeLines.push(
      `Note: The network initially assigned this move only ${priorPct}% probability. ` +
      `Search discovered its strength through deep calculation — a position where ` +
      `intuition alone would miss the best move.`,
    );
  } else {
    typeLines.push(`Network confidence: ${priorPct}% initial probability on the recommended move.`);
  }

  return typeLines.join('\n');
}

/**
 * Summarise macro-level threats as explicit flags for the LLM.
 * Returns null if there are no notable threats in either direction.
 */
function formatMacroThreats(threats: MacroThreatContext): string | null {
  const items: string[] = [];

  if (threats.xWinsMicroBoard) {
    items.push('Playing here wins the micro-board.');
  }
  if (threats.xCreatesMacroThreat) {
    items.push('Winning this micro-board gives X two in a row at the macro level — a direct macro threat.');
  }
  if (threats.oHasMacroThreat && threats.blocksOThreat) {
    items.push('O has a macro-level winning threat (two boards in a row). This move blocks it.');
  } else if (threats.oHasMacroThreat) {
    items.push('Warning: O has a macro-level winning threat — two boards in a row. This move does not directly block it.');
  }

  return items.length > 0
    ? items.map(i => `  - ${i}`).join('\n')
    : null;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function buildHintPrompt(
  state: GameState,
  analysis: GameAnalysis,
): string | null {
  const pv = analysis.principalVariation;
  if (pv.length < 2) return null;

  const humanWinPct = Math.round((1 - analysis.winProbability) * 100);
  const m = state.macro;

  // ── Constraint ──────────────────────────────────────────────────────────
  const isFreeMove = state.nextMicro === null || m[state.nextMicro] !== 0;
  const constraintLine = isFreeMove
    ? 'Free move — you can play in any open or empty board.'
    : `You must play in the ${POSITION[state.nextMicro!].toUpperCase()} board.`;

  // ── Macro board overview (compact 3×3 symbol grid) ───────────────────────
  const macroGrid = [
    `[ ${macroSymbol(m[0])} | ${macroSymbol(m[1])} | ${macroSymbol(m[2])} ]`,
    `[ ${macroSymbol(m[3])} | ${macroSymbol(m[4])} | ${macroSymbol(m[5])} ]`,
    `[ ${macroSymbol(m[6])} | ${macroSymbol(m[7])} | ${macroSymbol(m[8])} ]`,
  ].join('\n');

  // ── Full per-board state (replaces the old single-line status list) ───────
  const allBoardStates = renderAllMicroBoards(state.board, m);

  // ── Recommended move ─────────────────────────────────────────────────────
  const [xMacro, xCell] = pv[1];
  const destDescription  = boardStatusLabel(m[xCell], pieceCount(state.board, xCell));
  const bestCandidate    = analysis.candidates.find(c => c.isBest);
  const winPctAfterMove  = bestCandidate ? xWinPct(bestCandidate.qValue) : humanWinPct;

  // ── Active board grid (with arrow on recommended row) ────────────────────
  const displayMacro   = isFreeMove ? xMacro : (state.nextMicro as number);
  const microBoardLabel = isFreeMove
    ? `The ${POSITION[displayMacro].toUpperCase()} board (recommended target)`
    : `This is the current state of the ${POSITION[displayMacro].toUpperCase()} board (where you must play)`;
  const microBoardGrid = renderMicroBoard(state.board, displayMacro, xCell);

  // ── Position context (new) ────────────────────────────────────────────────
  const positionContext = formatPositionContext(
    analysis.positionType,
    analysis.topMoveVisitShare,
    analysis.priorOnBestMove,
    analysis.networkValue,
    analysis.searchValue,
    humanWinPct,
  );

  // ── Macro threats (new) ───────────────────────────────────────────────────
  const macroThreatLines = formatMacroThreats(analysis.macroThreats);

  // ── Principal variation ───────────────────────────────────────────────────
  const pvFormatted = formatPrincipalVariation(pv);

  // ── AI's rejected alternatives ───────────────────────────────────────────
  const alternatives = analysis.candidates
    .filter(c => !c.isBest && c.visits > 0)
    .slice(0, 3)
    .map(alt => {
      const [aMacro, aCell] = alt.move;
      const altXWin = xWinPct(alt.qValue);
      return (
        `  - ${POSITION[aCell].toUpperCase()} cell of ${POSITION[aMacro].toUpperCase()} board: ` +
        `explored ${Math.round(alt.visitShare * 100)}% of the time — ` +
        `would have given X ~${altXWin}% win probability`
      );
    })
    .join('\n');

  // ── Strategy and constraint (new) ────────────────────────────────────────
  const strategyLine  = formatMoveStrategy(analysis.moveStrategy, POSITION[xMacro].toUpperCase());
  const constraintLine2 = formatConstraint(
    analysis.constraintAnalysis,
    POSITION[xCell].toUpperCase(),
    destDescription,
  );

  // ── Assemble ──────────────────────────────────────────────────────────────
  return `You are coaching a player in Ultimate Tic-Tac-Toe. It is their turn and they have requested advice on their next move.

Game situation:
- It is your turn (you play as X)
- ${constraintLine}
- Your current win probability: ${humanWinPct}%
- The AI analysed ${analysis.simsUsed} possible future game sequences

Macro board overview (X = won by X, O = won by O, D = drawn, . = not yet won):
${macroGrid}

All board states:
${allBoardStates}

${microBoardLabel}:
${microBoardGrid}

Position analysis:
${positionContext}
${macroThreatLines ? `\nMacro-level threats:\n${macroThreatLines}` : ''}

Recommended move: ${POSITION[xCell].toUpperCase()} cell of the ${POSITION[xMacro].toUpperCase()} board
- Strategy: ${strategyLine}
- Constraint: ${constraintLine2}
- Your win probability after this move: ~${winPctAfterMove}%

Expected game line if both players continue to play optimally:
${pvFormatted}

Other moves the AI considered for its last turn (and why it rejected them):
${alternatives || '  (no meaningful alternatives — position was largely forced)'}

Begin your response with exactly one sentence that states the recommended move. Then in 2-3 sentences explain why this is the best option. Use this hierarchy when reasoning: the MCTS statistics (position type, visit concentration, win probability) reflect the full game and should drive your explanation — they are why the AI chose this move. The strategy label names what the move does in the immediate board; the constraint describes where it sends O. If these conflict or the strategy label is POSITIONAL, lead with the MCTS reasoning and use the label only to name the action, not to justify it. Write in plain prose only — do not use any markdown formatting, headers, or bold text.`;
}