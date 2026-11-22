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
 */
export function BingoBannerControl({ bannerVisible, onShow, onDismiss }: BingoBannerControlProps) {
  return (
    <div className={styles.bingo}>
      {bannerVisible ? (
        <>
          {/* aria-live rather than role="status": the Controller's one status region is the projector's. */}
          <p className={styles.bannerStatus} aria-live="polite">
            BINGO banner is showing on the projector
          </p>
          <button type="button" className={styles.dismiss} onClick={onDismiss}>
            Dismiss BINGO Banner
          </button>
        </>
      ) : (
        <button type="button" className={styles.bingoCalled} onClick={onShow}>
          BINGO CALLED
        </button>
      )}
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
