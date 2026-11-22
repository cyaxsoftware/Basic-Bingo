import { useSyncExternalStore } from 'react';
import type { SnapshotState, SnapshotStore } from './snapshotStore';

/** Subscribe a component to the latest app snapshot. */
export function useSnapshotState(store: SnapshotStore): SnapshotState {
  return useSyncExternalStore(store.subscribe, store.getState);
}
