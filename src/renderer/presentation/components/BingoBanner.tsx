import styles from './BingoBanner.module.css';

/**
 * The BINGO verification notice for the audience. Display only: it has no
 * controls and no timer. It exists exactly as long as `game.bingoBannerVisible`
 * is true, so only the operator's Dismiss (or a new game) removes it.
 */
export function BingoBanner() {
  return (
    <div className={styles.banner} role="alert">
      BINGO CALLED — PLEASE HOLD YOUR CARDS
    </div>
  );
}
