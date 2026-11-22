import type { BingoLetter } from '../../../shared/game/balls';
import { buildBoardRows } from '../../../shared/game/boardModel';
import type { CalledNumbers } from '../../../shared/game/calledNumbers';
import styles from './AudienceBoard.module.css';

export interface AudienceBoardProps {
  readonly calledNumbers: CalledNumbers;
  /** Rows blacked out because this game does not use them. */
  readonly disabledRows: readonly BingoLetter[];
}

/** The 75-number board for the audience. Display only: no buttons, no handlers. */
export function AudienceBoard({ calledNumbers, disabledRows }: AudienceBoardProps) {
  const rows = buildBoardRows(calledNumbers, disabledRows);
  return (
    <section className={styles.frame} aria-label="Bingo board">
      <div className={styles.board}>
        {rows.map((row) => (
          <div
            key={row.letter}
            className={styles.row}
            data-disabled={row.disabled}
            data-testid={`board-row-${row.letter}`}
          >
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
