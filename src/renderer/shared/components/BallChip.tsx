import { formatBall, letterForBall, type BallNumber } from '../../../shared/game/balls';
import styles from './BallChip.module.css';

export interface BallChipProps {
  readonly ball: BallNumber;
  /**
   * Sizing belongs to the view: pass a class that sets only `font-size`.
   * The number is 1em tall and the chip's diameter is always 2.6em.
   */
  readonly className?: string | undefined;
}

/** A filled ball in its B/I/N/G/O color showing letter and number. Display only. */
export function BallChip({ ball, className }: BallChipProps) {
  const letter = letterForBall(ball);
  return (
    <span
      className={className ? `${styles.chip} ${className}` : styles.chip}
      data-letter={letter}
      role="img"
      aria-label={formatBall(ball)}
    >
      <span className={styles.letter} aria-hidden="true">
        {letter}
      </span>
      <span className={styles.number} aria-hidden="true">
        {ball}
      </span>
    </span>
  );
}
