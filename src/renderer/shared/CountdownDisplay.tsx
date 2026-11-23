import type { TimerState } from '../../shared/timer/timerState';
import styles from './CountdownDisplay.module.css';

interface CountdownDisplayProps {
  readonly message: string;
  readonly time: string;
  readonly status: TimerState['status'];
  readonly label: string;
}

/** The same stage content scales to the projector and the Controller preview. */
export function CountdownDisplay({ message, time, status, label }: CountdownDisplayProps) {
  return (
    <section className={styles.stage} aria-label={label}>
      {status === 'expired' ? (
        <p className={styles.expired}>Time to Play!</p>
      ) : (
        <div className={styles.countdown}>
          <p className={styles.message}>{message}</p>
          <p className={styles.time} role="timer">
            {time}
          </p>
          {status === 'paused' ? <p className={styles.paused}>Paused</p> : null}
        </div>
      )}
    </section>
  );
}
