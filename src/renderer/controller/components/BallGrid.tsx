import { memo } from 'react';
import { formatBall, type BingoLetter } from '../../../shared/game/balls';
import { buildBoardRows, type BoardCell } from '../../../shared/game/boardModel';
import type { CalledNumbers } from '../../../shared/game/calledNumbers';
import styles from './BallGrid.module.css';

export interface BallGridProps {
  readonly calledNumbers: CalledNumbers;
  /** Rows the operator has blacked out: their balls cannot be tapped. */
  readonly disabledRows: readonly BingoLetter[];
  /** True while BINGO CALLED is up: no ball can be tapped until it is dismissed (the game rules refuse it too). */
  readonly locked?: boolean;
  readonly onToggle: (ball: number) => void;
  readonly onToggleRow: (letter: BingoLetter) => void;
}

/**
 * The operator's 5×15 touch grid. Tap toggles a ball; there is no confirmation
 * and no separate undo (tapping again removes it). Tapping a row's letter blacks the row out (or brings it
 * back), because this game does not use it. The balls in a blacked-out row cannot be tapped.
 */
export function BallGrid({
  calledNumbers,
  disabledRows,
  locked = false,
  onToggle,
  onToggleRow,
}: BallGridProps) {
  const rows = buildBoardRows(calledNumbers, disabledRows);
  return (
    <section
      className={styles.grid}
      aria-label="Bingo balls"
      data-locked={locked}
      aria-description={locked ? 'Locked while BINGO CALLED is up. Dismiss it to call numbers.' : undefined}
    >
      {rows.map((row) => (
        <div
          key={row.letter}
          className={styles.row}
          role="group"
          aria-label={`${row.letter} row`}
          data-disabled={row.disabled}
        >
          <button
            type="button"
            className={styles.letter}
            data-letter={row.letter}
            aria-pressed={row.disabled}
            aria-label={`Black out ${row.letter} row`}
            onClick={() => onToggleRow(row.letter)}
          >
            {row.letter}
          </button>
          {row.cells.map((cell) => (
            <BallButton key={cell.ball} cell={cell} disabled={row.disabled || locked} onToggle={onToggle} />
          ))}
        </div>
      ))}
    </section>
  );
}

const STATUS_TEXT = { uncalled: 'not called', called: 'called', current: 'current call' } as const;

const BallButton = memo(function BallButton({
  cell,
  disabled,
  onToggle,
}: {
  cell: BoardCell;
  disabled: boolean;
  onToggle: (ball: number) => void;
}) {
  return (
    <button
      type="button"
      className={styles.ball}
      disabled={disabled}
      data-letter={cell.letter}
      data-status={cell.status}
      aria-pressed={cell.status !== 'uncalled'}
      aria-label={`${formatBall(cell.ball)}, ${STATUS_TEXT[cell.status]}`}
      onClick={() => onToggle(cell.ball)}
    >
      {/* The button is the tap target (the whole cell); the chip is only what is drawn inside it. */}
      <span className={styles.chip}>{cell.ball}</span>
    </button>
  );
});
