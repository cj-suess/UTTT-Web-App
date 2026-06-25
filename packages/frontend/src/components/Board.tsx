/**
 * Board component.
 *
 * Renders the full 9×9 Ultimate Tic-Tac-Toe grid. Supports an optional
 * `hintMove` prop that highlights the recommended cell with a flash
 * animation when the user requests a hint. `hintKey` increments each
 * time a new hint is requested, forcing React to remount the hinted cell
 * and restart the animation.
 */

import type { Cell as CellValue, GameState, MacroResult, Move } from '@uttt/shared';
import { getLegalMoves } from '@uttt/shared';
import styles from './Board.module.css';

interface BoardProps {
  state: GameState;
  onMove: (move: Move) => void;
  disabled: boolean;
  /** [macro, cell] of the recommended move. Null when no hint is active. */
  hintMove?: [number, number] | null;
  /** Increments each time a new hint is requested, restarts the animation. */
  hintKey?: number;
}

export function Board({ state, onMove, disabled, hintMove, hintKey }: BoardProps) {
  const legalMoves = disabled ? [] : getLegalMoves(state);
  const legalSet = new Set(legalMoves.map(([m, c]) => `${m},${c}`));

  const isConstrained =
    state.nextMicro !== null && state.macro[state.nextMicro] === 0;

  return (
    <div className={`${styles.board} ${disabled ? styles.boardDisabled : ''}`}>
      {Array.from({ length: 9 }, (_, m) => {
        const macroResult = state.macro[m] as MacroResult;
        const isHighlighted = isConstrained && state.nextMicro === m;
        const isDimmed = isConstrained && !isHighlighted && macroResult === 0;

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
              const isHinted = hintMove != null && hintMove[0] === m && hintMove[1] === c;

              return (
                <button
                  // hintKey in the key forces remount → animation restarts
                  key={isHinted ? `${m}-${c}-hint-${hintKey}` : `${m}-${c}`}
                  className={[
                    styles.cell,
                    isLegal  ? styles.cellLegal  : '',
                    isHinted ? styles.cellHinted : '',
                  ].join(' ')}
                  onClick={() => isLegal && onMove([m, c])}
                  disabled={!isLegal}
                  aria-label={`macro ${m} cell ${c}`}
                >
                  {value === 1  && <XMark />}
                  {value === -1 && <OMark />}
                </button>
              );
            })}

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
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

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