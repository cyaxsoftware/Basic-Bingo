import { useEffect, useState } from 'react';
import {
  formatGameDuration,
  gameElapsedMs,
  isClockHeld,
  type GameClock as Clock,
} from '../../../shared/games/gameLog';
import styles from './GameClock.module.css';

export interface GameClockProps {
  /** Which game this is (the next number in the games-played list). */
  readonly gameNumber: number;
  /** The game's clock from the snapshot: the first ball, and the BINGO CALLED press that holds it. */
  readonly clock: Clock;
}

/** The current time, refreshed twice a second while `running`, so a second never visibly skips. */
function useNow(running: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const tick = () => setNow(Date.now());
    tick();
    const timer = window.setInterval(tick, 500);
    return () => window.clearInterval(timer);
  }, [running]);
  return now;
}

/**
 * The running game clock: game number over the time since the first ball. Pressing BINGO CALLED holds it still
 * while the card is checked; pressing the button again (Dismiss) lets it carry on from where it was held, and
 * the time spent checking is not counted. What it shows comes from the shared rules (gameElapsedMs), which the
 * games-played log also uses. It hides itself when its space is too narrow (see GameClock.module.css).
 */
export function GameClock({ gameNumber, clock }: GameClockProps) {
  const held = isClockHeld(clock);
  const now = useNow(!held);
  const seconds = Math.floor(gameElapsedMs(clock, now) / 1000);
  return (
    <div className={styles.clock}>
      <div
        className={styles.face}
        role="timer"
        aria-label={`Game ${gameNumber} time`}
        title={held ? 'Held while BINGO CALLED is up. Dismiss it to carry on.' : 'Time since the first ball'}
      >
        <span className={styles.label}>Game {gameNumber}</span>
        <span className={styles.time} data-held={held}>
          {formatGameDuration(seconds)}
        </span>
      </div>
    </div>
  );
}
