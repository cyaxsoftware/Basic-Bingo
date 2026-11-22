/**
 * Renderer-side holder for the latest {@link AppSnapshot} from main.
 *
 * - Subscribes to pushes *before* requesting the initial snapshot, so nothing
 *   published in between is missed.
 * - Accepts a snapshot only if its revision is newer than the current one,
 *   so out-of-order deliveries can never show stale state.
 *
 * Designed for React's useSyncExternalStore (see useSnapshotState.ts).
 */
import type { AppSnapshot, PresentationApi } from '../../shared/ipc/contract';

export type SnapshotState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly snapshot: AppSnapshot }
  | { readonly status: 'error'; readonly message: string };

export interface SnapshotStore {
  subscribe(listener: () => void): () => void;
  getState(): SnapshotState;
  dispose(): void;
}

export function createSnapshotStore(source: PresentationApi): SnapshotStore {
  let state: SnapshotState = { status: 'loading' };
  const listeners = new Set<() => void>();

  const emit = () => listeners.forEach((listener) => listener());

  const accept = (snapshot: AppSnapshot) => {
    if (state.status === 'ready' && snapshot.revision <= state.snapshot.revision) return;
    state = { status: 'ready', snapshot };
    emit();
  };

  const unsubscribe = source.onSnapshot(accept);

  source.getSnapshot().then(accept, (error: unknown) => {
    if (state.status !== 'loading') return;
    state = { status: 'error', message: error instanceof Error ? error.message : String(error) };
    emit();
  });

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getState: () => state,
    dispose() {
      unsubscribe();
      listeners.clear();
    },
  };
}
