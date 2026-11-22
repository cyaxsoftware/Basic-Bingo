import { describe, expect, it, vi } from 'vitest';
import type { PresentationApi } from '../../shared/ipc/contract';
import { createFakeBingoApi, makeSnapshot } from '../test/fakeBingoApi';
import { createSnapshotStore } from './snapshotStore';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('createSnapshotStore', () => {
  it('starts loading, then holds the initial snapshot', async () => {
    const api = createFakeBingoApi(makeSnapshot({ revision: 4 }));
    const store = createSnapshotStore(api);
    expect(store.getState()).toEqual({ status: 'loading' });
    await tick();
    const state = store.getState();
    expect(state.status === 'ready' && state.snapshot.revision).toBe(4);
  });

  it('subscribes before fetching so early pushes are not lost', () => {
    const api = createFakeBingoApi();
    createSnapshotStore(api);
    expect(vi.mocked(api.onSnapshot).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(api.getSnapshot).mock.invocationCallOrder[0]!,
    );
  });

  it('ignores stale or duplicate revisions', async () => {
    const api = createFakeBingoApi(makeSnapshot({ revision: 5 }));
    const store = createSnapshotStore(api);
    await tick();
    const listener = vi.fn();
    store.subscribe(listener);

    api.push(makeSnapshot({ revision: 3, game: { calledNumbers: [1] } }));
    api.push(makeSnapshot({ revision: 5, game: { calledNumbers: [2] } }));
    expect(listener).not.toHaveBeenCalled();

    api.push(makeSnapshot({ revision: 6, game: { calledNumbers: [3] } }));
    expect(listener).toHaveBeenCalledOnce();
    const state = store.getState();
    expect(state.status === 'ready' && state.snapshot.game.calledNumbers).toEqual([3]);
  });

  it('keeps a newer pushed snapshot if the initial fetch resolves late with an older one', async () => {
    let resolveFetch: (s: ReturnType<typeof makeSnapshot>) => void = () => undefined;
    const listeners: Array<(s: ReturnType<typeof makeSnapshot>) => void> = [];
    const api: PresentationApi = {
      getSnapshot: () => new Promise((resolve) => (resolveFetch = resolve)),
      onSnapshot: (l) => {
        listeners.push(l);
        return () => undefined;
      },
    };
    const store = createSnapshotStore(api);
    listeners.forEach((l) => l(makeSnapshot({ revision: 10 })));
    resolveFetch(makeSnapshot({ revision: 9 }));
    await tick();
    const state = store.getState();
    expect(state.status === 'ready' && state.snapshot.revision).toBe(10);
  });

  it('reports an error if the initial fetch fails', async () => {
    const api: PresentationApi = {
      getSnapshot: () => Promise.reject(new Error('no main')),
      onSnapshot: () => () => undefined,
    };
    const store = createSnapshotStore(api);
    await tick();
    expect(store.getState()).toEqual({ status: 'error', message: 'no main' });
  });
});
