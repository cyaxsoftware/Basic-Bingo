import { useId, useState } from 'react';
import { formatGameDuration, formatGameStart, type GameRecord } from '../../../shared/games/gameLog';
import { ConfirmDialog } from './ConfirmDialog';
import styles from './GamesPlayed.module.css';

export interface GamesPlayedProps {
  /** Finished games, oldest first (shown newest first). */
  readonly records: readonly GameRecord[];
  /** Empties the history. Called only after the operator confirms. */
  readonly onClear: () => void;
  /** For tests: the time to treat as now (decides whether a start time needs its day). */
  readonly now?: number;
}

/** The night's games: number, when the first ball was called, the pattern and how long it took. */
export function GamesPlayed({ records, onClear, now }: GamesPlayedProps) {
  const [confirming, setConfirming] = useState(false);
  const headingId = useId();
  // Newest first; each game keeps the number it was played as.
  const rows = records.toReversed();

  return (
    <section className={styles.panel} aria-label="Games played">
      <div className={styles.head}>
        <h2 id={headingId} className={styles.title}>
          Games played · {records.length}
        </h2>
        <button
          type="button"
          className={styles.clear}
          disabled={records.length === 0}
          onClick={() => setConfirming(true)}
        >
          Clear history…
        </button>
      </div>

      {records.length === 0 ? (
        <p className={styles.empty}>
          No games yet. A game is added here when you press New Game after calling at least one ball.
        </p>
      ) : (
        <div className={styles.scroll} tabIndex={0} role="region" aria-label="Games played, newest first">
          <table className={styles.table} aria-labelledby={headingId}>
            <thead>
              <tr>
                <th scope="col" className={styles.number} aria-label="Game number">
                  #
                </th>
                <th scope="col">First ball</th>
                <th scope="col">Game</th>
                <th scope="col" className={styles.duration}>
                  Duration
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((record) => (
                <tr key={record.id}>
                  <td className={styles.number}>{record.number}</td>
                  <td>{formatGameStart(record.startedAt, now)}</td>
                  <td className={styles.name} title={record.title}>
                    {record.title}
                  </td>
                  <td className={styles.duration}>{formatGameDuration(record.durationSeconds)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {confirming ? (
        <ConfirmDialog
          title="Clear the games played?"
          confirmLabel="Clear history"
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            onClear();
          }}
        >
          <p>
            <strong>This will clear:</strong> the list of {records.length} game
            {records.length === 1 ? '' : 's'} played.
          </p>
          <p>
            <strong>Kept:</strong> the game in progress, its called numbers and everything else.
          </p>
        </ConfirmDialog>
      ) : null}
    </section>
  );
}
