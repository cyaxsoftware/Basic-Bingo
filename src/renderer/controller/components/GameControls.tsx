import { useState } from 'react';
import { MAX_BALL } from '../../../shared/game/balls';
import { ConfirmDialog } from './ConfirmDialog';
import styles from './GameControls.module.css';

export interface BingoBannerControlProps {
  readonly bannerVisible: boolean;
  readonly onShow: () => void;
  readonly onDismiss: () => void;
}

/**
 * The prominent BINGO control. While the banner is up, the same spot offers
 * Dismiss instead, so the operator never has to hunt for it. The banner never
 * hides on its own.
 *
 * It is ONE button whose label and action change, not two buttons swapped in
 * and out: React then keeps the same DOM element, so a keyboard operator who
 * pressed Enter keeps focus on it.
 */
export function BingoBannerControl({ bannerVisible, onShow, onDismiss }: BingoBannerControlProps) {
  return (
    <div className={styles.bingo}>
      {/* aria-live rather than role="status": the Controller's one status region is the projector's. */}
      {/* Describes the game flag only. Whether a projector is open is shown separately in the header. */}
      {bannerVisible ? (
        <p className={styles.bannerStatus} aria-live="polite">
          BINGO banner enabled
        </p>
      ) : null}
      <button
        type="button"
        className={bannerVisible ? styles.dismiss : styles.bingoCalled}
        onClick={bannerVisible ? onDismiss : onShow}
      >
        {bannerVisible ? 'Dismiss BINGO Banner' : 'BINGO CALLED'}
      </button>
    </div>
  );
}

export interface NewGameControlProps {
  readonly calledCount: number;
  readonly bannerVisible: boolean;
  readonly onNewGame: () => void;
}

/** Secondary button that must be confirmed in a dialog naming what will be cleared and what is kept. */
export function NewGameControl({ calledCount, bannerVisible, onNewGame }: NewGameControlProps) {
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <button type="button" className={styles.newGame} onClick={() => setConfirming(true)}>
        New Game
      </button>
      {confirming ? (
        <ConfirmDialog
          title="Start a new game?"
          confirmLabel="Start New Game"
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            onNewGame();
          }}
        >
          <p>
            <strong>This will clear:</strong> {describeClears(calledCount, bannerVisible)}.
          </p>
          <p>
            <strong>Kept:</strong> the winning pattern, saved patterns and images, and what the projector is
            showing.
          </p>
        </ConfirmDialog>
      ) : null}
    </>
  );
}

function describeClears(calledCount: number, bannerVisible: boolean): string {
  const items: string[] = [];
  if (calledCount > 0) {
    items.push(`all ${calledCount} called number${calledCount === 1 ? '' : 's'} (of ${MAX_BALL})`);
  }
  if (bannerVisible) items.push('the BINGO banner');
  return items.length > 0
    ? items.join(' and ')
    : 'nothing yet: no numbers are called and no banner is showing';
}
