import { PATTERN_CELL_COUNT, type ShownPattern as ShownPatternData } from '../../../shared/patterns';
import styles from './ShownPattern.module.css';

export interface ShownPatternProps {
  readonly pattern: ShownPatternData;
}

const CELLS = Array.from({ length: PATTERN_CELL_COUNT }, (_, index) => index);

/**
 * The winning pattern the operator pushed: its title and the 5x5 grid, lit only where the operator selected
 * cells (there is no free-space rule). Display only, like everything in this window.
 */
export function ShownPattern({ pattern }: ShownPatternProps) {
  const lit = pattern.cells.filter(Boolean).length;
  return (
    <section className={styles.panel} aria-label="Winning pattern">
      <h2 className={styles.title}>{pattern.title}</h2>
      <div
        className={styles.grid}
        role="img"
        aria-label={`${pattern.title}: ${lit} of ${PATTERN_CELL_COUNT} squares`}
      >
        {CELLS.map((index) => (
          <span
            key={index}
            className={styles.cell}
            data-on={pattern.cells[index] === true}
            data-testid={`pattern-cell-${index}`}
          />
        ))}
      </div>
    </section>
  );
}
