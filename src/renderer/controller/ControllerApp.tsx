import type { ControllerApi } from '../../shared/ipc/contract';
import type { SnapshotStore } from '../shared/snapshotStore';
import { useSnapshotState } from '../shared/useSnapshotState';
import { BallGrid } from './components/BallGrid';
import { CallSummaryPanel } from './components/CallSummaryPanel';
import { BingoBannerControl, NewGameControl } from './components/GameControls';
import { NoticeArea } from './components/NoticeArea';
import { PresentationControls } from './components/PresentationControls';
import styles from './ControllerApp.module.css';
import { useControllerActions } from './useControllerActions';

export interface ControllerAppProps {
  readonly api: ControllerApi;
  readonly store: SnapshotStore;
}

/** Operator console: ball grid, call summary and projector controls. */
export function ControllerApp({ api, store }: ControllerAppProps) {
  const state = useSnapshotState(store);
  const actions = useControllerActions(api);

  if (state.status === 'loading') {
    return <div className={styles.message}>Loading game…</div>;
  }
  if (state.status === 'error') {
    return (
      <div className={styles.message} role="alert">
        Could not connect to the game engine: {state.message}
      </div>
    );
  }

  const { snapshot } = state;
  const { calledNumbers, bingoBannerVisible } = snapshot.game;
  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        <h1 className={styles.title}>Offline Bingo</h1>
        <PresentationControls
          displays={snapshot.displays}
          presentation={snapshot.presentation}
          preferredDisplayId={snapshot.preferredDisplayId}
          onProject={actions.openPresentation}
          onPreview={actions.openPreview}
          onStop={actions.closePresentation}
          onRefreshDisplays={actions.refreshDisplays}
        />
        <NewGameControl
          calledCount={calledNumbers.length}
          bannerVisible={bingoBannerVisible}
          onNewGame={actions.newGame}
        />
      </header>

      <NoticeArea
        notices={snapshot.notices}
        persistence={snapshot.persistence}
        actionError={actions.lastError}
        onDismissNotice={actions.dismissNotice}
        onDismissActionError={actions.clearError}
      />

      <main className={styles.main}>
        <BallGrid calledNumbers={calledNumbers} onToggle={actions.toggleBall} />
        <div className={styles.side}>
          <CallSummaryPanel calledNumbers={calledNumbers} />
          <BingoBannerControl
            bannerVisible={bingoBannerVisible}
            onShow={actions.showBingoBanner}
            onDismiss={actions.dismissBingoBanner}
          />
        </div>
      </main>
    </div>
  );
}
