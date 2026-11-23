import type { SnapshotStore } from '../shared/snapshotStore';
import { useSnapshotState } from '../shared/useSnapshotState';
import { AudienceBoard } from './components/AudienceBoard';
import { BingoBanner } from './components/BingoBanner';
import { CallDisplay } from './components/CallDisplay';
import { findMedia } from '../../shared/media';
import { CountdownView } from './components/CountdownView';
import { GameNumber } from './components/GameNumber';
import { nextGameNumber } from '../../shared/games/gameLog';
import { ShownPattern } from './components/ShownPattern';
import { SingleImageView } from './components/SingleImageView';
import { SlideshowView } from './components/SlideshowView';
import styles from './PresentationApp.module.css';

export interface PresentationAppProps {
  readonly store: SnapshotStore;
}

/**
 * Read-only audience display. It has no controls by design: everything it
 * shows comes from main-process snapshots.
 */
export function PresentationApp({ store }: PresentationAppProps) {
  const state = useSnapshotState(store);

  if (state.status !== 'ready') {
    // Never show an error to the audience; the Controller reports problems.
    return <div className={styles.root} data-mode="loading" />;
  }

  const { snapshot } = state;
  const onBoard = snapshot.presentationMode === 'gameBoard';
  const gameNumber = nextGameNumber(snapshot.gameLog);
  return (
    <main
      className={styles.root}
      data-mode={snapshot.presentation.kind}
      data-view={snapshot.presentationMode}
    >
      <h1 className={styles.heading}>Basic Bingo Presentation</h1>
      {/*
        The Game Board always keeps a band of its own at the top, so the board and the calls do not move when the
        BINGO banner comes and goes (the banner fills the band). In other modes the flag is untouched and returns
        with the board.
      */}
      {onBoard ? (
        <div className={styles.bannerSlot} data-testid="banner-slot">
          {snapshot.game.bingoBannerVisible ? <BingoBanner /> : null}
        </div>
      ) : null}
      <div className={styles.stage}>
        {onBoard ? (
          <div className={styles.game} data-pattern={snapshot.shownPattern ? 'shown' : 'none'}>
            {/* The pattern the operator pushed (nothing until they do), the board, and the calls. */}
            {snapshot.shownPattern ? (
              <div className={styles.pattern}>
                <ShownPattern pattern={snapshot.shownPattern} gameNumber={gameNumber} />
              </div>
            ) : null}
            <div className={styles.board}>
              {/* With no pattern there is no name to sit under, so the number takes the board's corner. */}
              {snapshot.shownPattern ? null : <GameNumber number={gameNumber} placement="corner" />}
              <AudienceBoard
                calledNumbers={snapshot.game.calledNumbers}
                disabledRows={snapshot.game.disabledRows}
              />
            </div>
            <div className={styles.calls}>
              <CallDisplay calledNumbers={snapshot.game.calledNumbers} />
            </div>
          </div>
        ) : snapshot.presentationMode === 'singleImage' ? (
          <SingleImageView
            image={
              snapshot.singleImage.imageId === null
                ? null
                : (findMedia(snapshot.mediaLibrary, snapshot.singleImage.imageId) ?? null)
            }
          />
        ) : snapshot.presentationMode === 'countdown' ? (
          <CountdownView timer={snapshot.timer} />
        ) : (
          <SlideshowView
            slideshow={snapshot.slideshow}
            playback={snapshot.slideshowPlayback}
            library={snapshot.mediaLibrary}
            timer={snapshot.timer}
          />
        )}
      </div>
    </main>
  );
}
