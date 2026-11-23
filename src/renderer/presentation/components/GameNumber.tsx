import styles from './GameNumber.module.css';

export interface GameNumberProps {
  /** The game being played, or about to be (one more than the last game logged). */
  readonly number: number;
}

/**
 * "GAME 4" in the top-left corner of the board, so the hall can tell which game this is. It sits in the padding
 * above the first row and never takes room from the board.
 */
export function GameNumber({ number }: GameNumberProps) {
  return (
    <p className={styles.gameNumber} aria-label={`Game ${number}`}>
      <span aria-hidden="true" className={styles.word}>
        Game
      </span>{' '}
      <span aria-hidden="true" className={styles.number}>
        {number}
      </span>
    </p>
  );
}
