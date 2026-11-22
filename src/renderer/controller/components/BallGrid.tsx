import { memo } from 'react';
import { formatBall, type BingoLetter } from '../../../shared/game/balls';
import { buildBoardRows, type BoardCell } from '../../../shared/game/boardModel';
import type { CalledNumbers } from '../../../shared/game/calledNumbers';
import styles from './BallGrid.module.css';

export interface BallGridProps {
  readonly calledNumbers: CalledNumbers;
  /** Rows the operator has blacked out. A visual reminder only: those balls can still be tapped. */
  readonly disabledRows: readonly BingoLetter[];
  readonly onToggle: (ball: number) => void;
  readonly onToggleRow: (letter: BingoLetter) => void;
}

/**
 * The operator's 5×15 touch grid. Tap toggles a ball; there is no confirmation
 * and no separate undo (tapping again removes it). Tapping a row's letter blacks the row out (or brings it
 * back), as a reminder that this game does not use it; it changes nothing about the calls.
 */
export function BallGrid({ calledNumbers, disabledRows, onToggle, onToggleRow }: BallGridProps) {
  const rows = buildBoardRows(calledNumbers, disabledRows);
  return (
    <section className={styles.grid} aria-label="Bingo balls">
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
            <BallButton key={cell.ball} cell={cell} onToggle={onToggle} />
          ))}
        </div>
      ))}
    </section>
  );
}

const STATUS_TEXT = { uncalled: 'not called', called: 'called', current: 'current call' } as const;

const BallButton = memo(function BallButton({
  cell,
  onToggle,
}: {
  cell: BoardCell;
  onToggle: (ball: number) => void;
}) {
  return (
    <button
      type="button"
      className={styles.ball}
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
