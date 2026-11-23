import styles from './GameNumber.module.css';

export interface GameNumberProps {
  /** The game being played, or about to be (one more than the last game logged). */
  readonly number: number;
  /**
   * `caption`: under the winning pattern's name, inside the pattern card (the usual place).
   * `corner`: the top-left corner of the board, for when no pattern has been pushed and there is no name to sit
   * under. It sits in the padding above the first row and never takes room from the board.
   */
  readonly placement: 'caption' | 'corner';
}

/** "GAME 4", so the hall can tell which game this is. Display only. */
export function GameNumber({ number, placement }: GameNumberProps) {
  return (
    <p className={`${styles.gameNumber} ${styles[placement]}`} aria-label={`Game ${number}`}>
      <span aria-hidden="true" className={styles.word}>
        Game
      </span>{' '}
      <span aria-hidden="true" className={styles.number}>
        {number}
      </span>
    </p>
  );
}
