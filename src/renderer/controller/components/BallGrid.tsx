import { memo } from 'react';
import { formatBall } from '../../../shared/game/balls';
import { buildBoardRows, type BoardCell } from '../../../shared/game/boardModel';
import type { CalledNumbers } from '../../../shared/game/calledNumbers';
import styles from './BallGrid.module.css';

export interface BallGridProps {
  readonly calledNumbers: CalledNumbers;
  readonly onToggle: (ball: number) => void;
}

/**
 * The operator's 5×15 touch grid. Tap toggles a ball; there is no confirmation
 * and no separate undo (tapping again removes it).
 */
export function BallGrid({ calledNumbers, onToggle }: BallGridProps) {
  const rows = buildBoardRows(calledNumbers);
  return (
    <section className={styles.grid} aria-label="Bingo balls">
      {rows.map((row) => (
        <div key={row.letter} className={styles.row} role="group" aria-label={`${row.letter} row`}>
          <div className={styles.letter} data-letter={row.letter} aria-hidden="true">
            {row.letter}
          </div>
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
