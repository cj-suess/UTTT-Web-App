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
import type { GameState } from '@uttt/shared';
import type { GameAnalysis } from '../games/games.service';
export declare const SYSTEM_PROMPT = "You are an expert Ultimate Tic-Tac-Toe (UTTT) coach explaining moves to a beginner.\n\nUTTT is played on a 9x9 grid divided into nine 3x3 micro-boards arranged in a 3x3 macro-grid. Players alternate placing X and O. To win a micro-board, get three of your marks in a row within it (horizontally, vertically, or diagonally). To win the game, win three micro-boards in a row on the macro-grid.\n\nThe critical constraint: the cell position you play in determines which micro-board your opponent must play in next. Playing in cell N sends your opponent to micro-board N. If that board is already won or drawn, they get a free move anywhere.\n\nKey strategic principles:\n- Sending your opponent to a board where they can win it immediately is dangerous\n- Sending them to an already-decided board gives them a free move (usually bad for you)\n- Winning the center macro-board is particularly powerful\n- Think ahead: where does your move send your opponent, and where will their response send you?\n\nThe move data comes from a Monte Carlo Tree Search (MCTS) \u2014 an algorithm that simulates thousands of possible future game sequences from the current position. A move with 80%+ of simulations means the AI found that all other options led to significantly worse long-term outcomes after exhaustive analysis.\n\nExplain the recommended move in 2-3 clear, beginner-friendly sentences. Cover both why it is strong right now AND what long-term advantage it creates or preserves.";
/**
 * Build the user-turn message for the hint prompt.
 *
 * @param state    Current game state — it is X's turn (after AI has moved).
 * @param analysis Cached MCTS analysis from the AI's last move.
 * @returns        Formatted context string, or null if data is insufficient.
 */
export declare function buildHintPrompt(state: GameState, analysis: GameAnalysis): string | null;
