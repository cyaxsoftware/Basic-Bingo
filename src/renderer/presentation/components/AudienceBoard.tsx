import { buildBoardRows } from '../../../shared/game/boardModel';
import type { CalledNumbers } from '../../../shared/game/calledNumbers';
import styles from './AudienceBoard.module.css';

export interface AudienceBoardProps {
  readonly calledNumbers: CalledNumbers;
}

/** The 75-number board for the audience. Display only: no buttons, no handlers. */
export function AudienceBoard({ calledNumbers }: AudienceBoardProps) {
  const rows = buildBoardRows(calledNumbers);
  return (
    <section className={styles.frame} aria-label="Bingo board">
      <div className={styles.board}>
        {rows.map((row) => (
          <div key={row.letter} className={styles.row}>
            <div className={styles.letter} data-letter={row.letter}>
              {row.letter}
            </div>
            {row.cells.map((cell) => (
              <div
                key={cell.ball}
                className={styles.cell}
                data-letter={cell.letter}
                data-status={cell.status}
                data-testid={`board-ball-${cell.ball}`}
              >
                {cell.ball}
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
