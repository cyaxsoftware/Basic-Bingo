import { summarizeCalls } from '../../../shared/game/boardModel';
import type { CalledNumbers } from '../../../shared/game/calledNumbers';
import { BallChip } from '../../shared/components/BallChip';
import styles from './CallDisplay.module.css';

export interface CallDisplayProps {
  readonly calledNumbers: CalledNumbers;
}

/** Large current ball and the previous five calls, newest first. */
export function CallDisplay({ calledNumbers }: CallDisplayProps) {
  const { current, previous } = summarizeCalls(calledNumbers);
  return (
    <section className={styles.panel} aria-label="Current call">
      <div className={styles.layout}>
        <div className={styles.currentArea}>
          {current === null ? (
            <p className={styles.ready}>Ready for first call</p>
          ) : (
            <BallChip ball={current} className={styles.currentBall} />
          )}
          <p className={styles.caption} aria-hidden="true">
            Current call
          </p>
        </div>
        {previous.length > 0 && (
          <div className={styles.previousArea}>
            <h2 className={styles.heading}>Previous calls</h2>
            <ol className={styles.previous} aria-label="Previous calls">
              {previous.map((ball) => (
                <li key={ball}>
                  <BallChip ball={ball} className={styles.previousBall} />
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </section>
  );
}
