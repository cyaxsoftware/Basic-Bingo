import { MAX_BALL } from '../../../shared/game/balls';
import { summarizeCalls } from '../../../shared/game/boardModel';
import type { CalledNumbers } from '../../../shared/game/calledNumbers';
import { BallChip } from '../../shared/components/BallChip';
import styles from './CallSummaryPanel.module.css';

export interface CallSummaryPanelProps {
  readonly calledNumbers: CalledNumbers;
}

/** Current call, previous five (newest first) and called count. */
export function CallSummaryPanel({ calledNumbers }: CallSummaryPanelProps) {
  const { current, previous, calledCount } = summarizeCalls(calledNumbers);
  return (
    <aside className={styles.panel} aria-label="Call summary">
      <section className={styles.currentSection}>
        <h2 className={`${styles.heading} ${styles.currentHeading}`}>Current call</h2>
        <div className={styles.current} data-testid="current-call">
          {current === null ? (
            <span className={styles.empty}>No calls yet</span>
          ) : (
            <BallChip ball={current} className={styles.currentChip} />
          )}
        </div>
      </section>

      <section className={styles.previousSection}>
        <h2 className={`${styles.heading} ${styles.previousHeading}`}>Previous</h2>
        {previous.length === 0 ? (
          <p className={styles.empty}>—</p>
        ) : (
          <ol className={styles.previous} data-testid="previous-calls">
            {previous.map((ball) => (
              <li key={ball}>
                <BallChip ball={ball} className={styles.previousChip} />
              </li>
            ))}
          </ol>
        )}
      </section>

      <p className={styles.count} data-testid="called-count">
        Called: <strong>{calledCount}</strong> of {MAX_BALL}
      </p>
    </aside>
  );
}
