import { describe, expect, it, vi } from 'vitest';
import type { AppSnapshot } from '../../shared/ipc/contract';
import { createDefaultPersistedState, type PersistedState } from '../persistence/persistedState';
import type { StatePersister } from '../persistence/stateRepository';
import { AppStore } from './appStore';

class FakePersister implements StatePersister {
  saved: PersistedState[] = [];
  failNext = false;
  async save(state: PersistedState): Promise<void> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('disk full');
    }
    this.saved.push(state);
  }
  async flush(): Promise<void> {}
}

function createStore(calledNumbers: number[] = []) {
  const persister = new FakePersister();
  const initialState = { ...createDefaultPersistedState(), game: { calledNumbers } };
  const store = new AppStore({ initialState, persister });
  const snapshots: AppSnapshot[] = [];
  store.subscribe((s) => snapshots.push(s));
  return { store, persister, snapshots };
}

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('AppStore', () => {
  it('starts from the loaded state with the presentation closed', () => {
    const { store } = createStore([3, 9]);
    const snapshot = store.getSnapshot();
    expect(snapshot.game.calledNumbers).toEqual([3, 9]);
    expect(snapshot.presentation).toEqual({ kind: 'closed' });
    expect(snapshot.revision).toBe(1);
  });

  it('applies toggleBall, bumps the revision, emits and persists', async () => {
    const { store, persister, snapshots } = createStore();
    expect(store.dispatch({ type: 'toggleBall', ball: 3 })).toEqual({ ok: true });
    expect(store.dispatch({ type: 'toggleBall', ball: 9 })).toEqual({ ok: true });

    expect(snapshots.map((s) => s.revision)).toEqual([2, 3]);
    expect(store.getSnapshot().game.calledNumbers).toEqual([3, 9]);
    await flushPromises();
    expect(persister.saved.at(-1)?.game.calledNumbers).toEqual([3, 9]);
  });

  it('rejects invalid commands without changing state or revision', () => {
    const { store, snapshots, persister } = createStore([1]);
    const result = store.dispatch({ type: 'toggleBall', ball: 0 });
    expect(result.ok).toBe(false);
    expect(snapshots).toHaveLength(0);
    expect(store.getSnapshot().revision).toBe(1);
    expect(persister.saved).toHaveLength(0);
  });

  it('produces frozen snapshots', () => {
    const { store } = createStore();
    store.dispatch({ type: 'toggleBall', ball: 1 });
    expect(Object.isFrozen(store.getSnapshot())).toBe(true);
  });

  it('reports a save failure and clears it after the next successful save', async () => {
    const { store, persister } = createStore();
    persister.failNext = true;
    store.dispatch({ type: 'toggleBall', ball: 5 });
    await flushPromises();
    const failed = store.getSnapshot().persistence;
    expect(failed.kind).toBe('error');
    expect(failed.kind === 'error' && failed.message).toMatch(/disk full/);
    // The in-memory game is still correct even though the save failed.
    expect(store.getSnapshot().game.calledNumbers).toEqual([5]);

    store.dispatch({ type: 'toggleBall', ball: 6 });
    await flushPromises();
    expect(store.getSnapshot().persistence).toEqual({ kind: 'ok' });
  });

  it('does not emit for no-op runtime updates', () => {
    const { store, snapshots } = createStore();
    store.setPresentation({ kind: 'closed' });
    store.setDisplays([]);
    store.setPreferredDisplay(null);
    store.dismissNotice('missing');
    expect(snapshots).toHaveLength(0);
  });

  it('tracks presentation status without persisting it', async () => {
    const { store, persister } = createStore();
    store.setPresentation({ kind: 'projecting', displayId: 2, displayLabel: 'Projector' });
    await flushPromises();
    expect(store.getSnapshot().presentation).toEqual({
      kind: 'projecting',
      displayId: 2,
      displayLabel: 'Projector',
    });
    expect(persister.saved).toHaveLength(0);
  });

  it('persists the preferred display', async () => {
    const { store, persister } = createStore();
    store.setPreferredDisplay(7);
    await flushPromises();
    expect(persister.saved.at(-1)?.settings.preferredDisplayId).toBe(7);
  });

  it('adds, replaces and dismisses notices by id', () => {
    const { store } = createStore();
    store.addNotice({ id: 'a', level: 'warning', message: 'one' });
    store.addNotice({ id: 'a', level: 'warning', message: 'two' });
    expect(store.getSnapshot().notices).toEqual([{ id: 'a', level: 'warning', message: 'two' }]);
    store.dismissNotice('a');
    expect(store.getSnapshot().notices).toEqual([]);
  });

  it('keeps notifying other listeners when one throws', () => {
    const { store } = createStore();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const good = vi.fn();
    store.subscribe(() => {
      throw new Error('boom');
    });
    store.subscribe(good);
    store.dispatch({ type: 'toggleBall', ball: 1 });
    expect(good).toHaveBeenCalledOnce();
    errorSpy.mockRestore();
  });
});

/** Persister whose saves stay pending until the test resolves or rejects them, in order. */
class ManualPersister implements StatePersister {
  private queue: Array<{ resolve: () => void; reject: (e: Error) => void }> = [];
  saveCount = 0;
  save(): Promise<void> {
    this.saveCount++;
    return new Promise((resolve, reject) => this.queue.push({ resolve, reject }));
  }
  async flush(): Promise<void> {}
  succeedNext() {
    this.queue.shift()?.resolve();
  }
  failNext() {
    this.queue.shift()?.reject(new Error('disk full'));
  }
}

describe('AppStore save outcomes (audit finding 2, #19)', () => {
  function setup() {
    const persister = new ManualPersister();
    const store = new AppStore({ initialState: createDefaultPersistedState(), persister });
    return { store, persister };
  }

  it('is saved when nothing has changed', async () => {
    const { store } = setup();
    expect(store.saveStatus()).toBe('saved');
    expect(await store.settleSaves(1000)).toBe('saved');
  });

  it('waits for a pending save to complete', async () => {
    const { store, persister } = setup();
    store.dispatch({ type: 'toggleBall', ball: 1 });
    expect(store.saveStatus()).toBe('pending');
    const outcome = store.settleSaves(1000);
    persister.succeedNext();
    expect(await outcome).toBe('saved');
  });

  it('reports a failed final save as failed, not saved', async () => {
    const { store, persister } = setup();
    store.dispatch({ type: 'toggleBall', ball: 1 });
    const outcome = store.settleSaves(1000);
    persister.failNext();
    expect(await outcome).toBe('failed');
    expect(store.saveStatus()).toBe('failed');
  });

  it('reports a write that exceeds the deadline as a timeout', async () => {
    vi.useFakeTimers();
    try {
      const { store } = setup();
      store.dispatch({ type: 'toggleBall', ball: 1 });
      const outcome = store.settleSaves(2000);
      await vi.advanceTimersByTimeAsync(2000);
      expect(await outcome).toBe('timeout');
    } finally {
      vi.useRealTimers();
    }
  });

  it('is pending, not saved, when an older save succeeds but a newer one is still writing', async () => {
    const { store, persister } = setup();
    store.dispatch({ type: 'toggleBall', ball: 1 });
    store.dispatch({ type: 'toggleBall', ball: 2 });
    persister.succeedNext();
    await flushPromises();
    expect(store.saveStatus()).toBe('pending');
  });

  it('retrySave saves the current state again after a failure', async () => {
    const { store, persister } = setup();
    store.dispatch({ type: 'toggleBall', ball: 1 });
    persister.failNext();
    await flushPromises();
    expect(store.saveStatus()).toBe('failed');

    store.retrySave();
    expect(persister.saveCount).toBe(2);
    const outcome = store.settleSaves(1000);
    persister.succeedNext();
    expect(await outcome).toBe('saved');
    expect(store.getSnapshot().persistence).toEqual({ kind: 'ok' });
  });

  it('retrySave does nothing when already saved', () => {
    const { store, persister } = setup();
    store.retrySave();
    expect(persister.saveCount).toBe(0);
  });
});
