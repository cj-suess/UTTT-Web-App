/**
 * Board component.
 *
 * Renders the full 9×9 Ultimate Tic-Tac-Toe grid: a 3×3 arrangement of
 * micro-boards, each itself a 3×3 grid of cells. All layout is CSS Grid;
 * no canvas, no absolute pixel math.
 *
 * Highlighting logic matches the Python pygame version:
 *   - Constrained move → highlight target macro, dim all others
 *   - Free move        → no highlighting (all macros equal)
 */

import type { Cell as CellValue, GameState, MacroResult, Move } from '@uttt/shared';
import { getLegalMoves } from '@uttt/shared';
import styles from './Board.module.css';

// ─── Public component ─────────────────────────────────────────────────────────

interface BoardProps {
  state: GameState;
  onMove: (move: Move) => void;
  disabled: boolean;
}

export function Board({ state, onMove, disabled }: BoardProps) {
  // Build a Set for O(1) legality checks per cell.
  const legalMoves = disabled ? [] : getLegalMoves(state);
  const legalSet = new Set(legalMoves.map(([m, c]) => `${m},${c}`));

  // Is this a constrained move (nextMicro points to an open macro)?
  const isConstrained =
    state.nextMicro !== null && state.macro[state.nextMicro] === 0;

  return (
    <div className={`${styles.board} ${disabled ? styles.boardDisabled : ''}`}>
      {Array.from({ length: 9 }, (_, m) => {
        const macroResult = state.macro[m] as MacroResult;
        const isHighlighted = isConstrained && state.nextMicro === m;
        const isDimmed =
          isConstrained && !isHighlighted && macroResult === 0;

        return (
          <div
            key={m}
            className={[
              styles.micro,
              isHighlighted ? styles.microHighlighted : '',
              isDimmed      ? styles.microDimmed      : '',
            ].join(' ')}
          >
            {Array.from({ length: 9 }, (_, c) => {
              const value = state.board[m * 9 + c] as CellValue;
              const isLegal = legalSet.has(`${m},${c}`);
              return (
                <button
                  key={c}
                  className={`${styles.cell} ${isLegal ? styles.cellLegal : ''}`}
                  onClick={() => isLegal && onMove([m, c])}
                  disabled={!isLegal}
                  aria-label={`macro ${m} cell ${c}`}
                >
                  {value === 1  && <XMark />}
                  {value === -1 && <OMark />}
                </button>
              );
            })}

            {/* Won / drawn macro overlay */}
            {macroResult !== 0 && (
              <div
                className={[
                  styles.macroOverlay,
                  macroResult ===  1 ? styles.macroX    : '',
                  macroResult === -1 ? styles.macroO    : '',
                  macroResult ===  2 ? styles.macroDraw : '',
                ].join(' ')}
              >
                {macroResult ===  1 && <XMark large />}
                {macroResult === -1 && <OMark large />}
                {macroResult === 2 && <DMark large />}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── SVG symbols ──────────────────────────────────────────────────────────────
// Using SVG keeps the marks crisp at any cell size and avoids font-loading
// dependencies. The viewBox is fixed; CSS width/height controls rendered size.

function XMark({ large }: { large?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={large ? styles.symbolLarge : styles.symbolSmall}
      fill="none"
      aria-hidden="true"
    >
      <line x1="5"  y1="5"  x2="19" y2="19" stroke="var(--x)" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="19" y1="5"  x2="5"  y2="19" stroke="var(--x)" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function OMark({ large }: { large?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={large ? styles.symbolLarge : styles.symbolSmall}
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="8" stroke="var(--o)" strokeWidth="2.5" />
    </svg>
  );
}

function DMark({ large }: { large?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={large ? styles.symbolLarge : styles.symbolSmall} aria-hidden="true">
      <text x="12" y="17" textAnchor="middle" fontSize="14" fontWeight="700"
            fill="var(--draw)" fontFamily="var(--font)">D</text>
    </svg>
  )
}