import type { SnapshotStore } from '../shared/snapshotStore';
import { useSnapshotState } from '../shared/useSnapshotState';
import { AudienceBoard } from './components/AudienceBoard';
import { CallDisplay } from './components/CallDisplay';
import { ComingSoon } from './components/ComingSoon';
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
  return (
    <div className={styles.root} data-mode={snapshot.presentation.kind} data-view={snapshot.presentationMode}>
      {snapshot.presentationMode === 'gameBoard' ? (
        <>
          <CallDisplay calledNumbers={snapshot.game.calledNumbers} />
          <AudienceBoard calledNumbers={snapshot.game.calledNumbers} />
        </>
      ) : (
        <ComingSoon mode={snapshot.presentationMode} />
      )}
    </div>
  );
}
