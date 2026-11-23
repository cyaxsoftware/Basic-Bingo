import { describe, expect, it, vi } from 'vitest';
import type { AppSnapshot } from '../../shared/ipc/contract';
import { DEFAULT_TIMER } from '../../shared/timer/timerState';
import {
  createDefaultAppData,
  fromPersistedState,
  parsePersistedState,
  type PersistedState,
} from '../persistence/persistedState';
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
  const initialData = {
    ...createDefaultAppData(),
    game: { calledNumbers, bingoBannerVisible: false, disabledRows: [] },
  };
  const store = new AppStore({ initialData, persister });
  const snapshots: AppSnapshot[] = [];
  store.subscribe((s) => snapshots.push(s));
  return { store, persister, snapshots };
}

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A store with a clock the test moves by hand, for the games-played log. */
function createTimedStore() {
  const persister = new FakePersister();
  let nowMs = Date.UTC(2026, 10, 22, 19, 0, 0);
  let ids = 0;
  const store = new AppStore({
    initialData: createDefaultAppData(),
    persister,
    now: () => new Date(nowMs),
    newId: () => `game-${++ids}`,
  });
  const snapshots: AppSnapshot[] = [];
  store.subscribe((s) => snapshots.push(s));
  const wait = (seconds: number) => {
    nowMs += seconds * 1000;
  };
  return { store, persister, snapshots, wait, startedAt: nowMs };
}

describe('AppStore', () => {
  it('publishes and persists timer changes independently of New Game and presentation mode', () => {
    const { store, persister, snapshots } = createStore([3, 9]);
    expect(store.getSnapshot().timer).toEqual(DEFAULT_TIMER);
    expect(store.dispatchTimer({ type: 'setMessage', message: 'Next round' })).toEqual({ ok: true });
    expect(store.dispatchTimer({ type: 'setDuration', durationSeconds: 42 })).toEqual({ ok: true });
    expect(store.dispatchTimer({ type: 'start' })).toEqual({ ok: true });
    const running = store.getSnapshot().timer;
    expect(running).toMatchObject({ status: 'running', message: 'Next round', durationSeconds: 42 });
    expect(snapshots.map((snapshot) => snapshot.revision)).toEqual([2, 3, 4]);
    expect(persister.saved.at(-1)?.timer).toEqual(running);
    expect(store.getSnapshot().game.calledNumbers).toEqual([3, 9]);
    store.setPresentationMode('countdown');
    store.dispatch({ type: 'newGame' });
    expect(store.getSnapshot().timer).toBe(running);
    expect(persister.saved.at(-1)?.timer).toEqual(running);
    expect(store.getSnapshot().game.calledNumbers).toEqual([]);
  });

  it('does not publish or save rejected or unchanged timer commands', () => {
    const { store, snapshots, persister } = createStore();
    const initial = store.getSnapshot();
    expect(store.dispatchTimer({ type: 'reset' })).toEqual({ ok: true });
    expect(store.dispatchTimer({ type: 'setMessage', message: '' }).ok).toBe(false);
    expect(store.getSnapshot()).toBe(initial);
    expect(snapshots).toHaveLength(0);
    expect(persister.saved).toHaveLength(0);
  });

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

  describe('presentation mode', () => {
    it('starts on the game board and survives into the persisted document', async () => {
      const { store, persister } = createStore();
      expect(store.getSnapshot().presentationMode).toBe('gameBoard');
      store.setPresentationMode('slideshow');
      await flushPromises();
      expect(persister.saved.at(-1)?.presentation).toEqual({ mode: 'slideshow' });
    });

    it('starts from the loaded mode', () => {
      const persister = new FakePersister();
      const initialData = { ...createDefaultAppData(), presentation: { mode: 'countdown' as const } };
      const store = new AppStore({ initialData, persister });
      expect(store.getSnapshot().presentationMode).toBe('countdown');
      expect(store.getAppData().presentation.mode).toBe('countdown');
    });

    it('switching modes never changes a game field', () => {
      const { store } = createStore([3, 9]);
      store.dispatch({ type: 'showBingoBanner' });
      const game = store.getSnapshot().game;
      for (const mode of ['slideshow', 'singleImage', 'countdown', 'gameBoard'] as const) {
        store.setPresentationMode(mode);
        expect(store.getSnapshot().game).toBe(game);
      }
    });

    it('a new game leaves the selected mode unchanged', () => {
      const { store } = createStore([3, 9]);
      store.setPresentationMode('slideshow');
      store.dispatch({ type: 'newGame' });
      expect(store.getSnapshot().game.calledNumbers).toEqual([]);
      expect(store.getSnapshot().presentationMode).toBe('slideshow');
    });

    it('selecting the current mode again publishes and saves nothing', async () => {
      const { store, snapshots, persister } = createStore();
      store.setPresentationMode('gameBoard');
      await flushPromises();
      expect(snapshots).toHaveLength(0);
      expect(persister.saved).toHaveLength(0);
    });
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

  describe('games played log', () => {
    it('times a game from the first ball to the last BINGO CALLED press and logs it on New Game', async () => {
      const { store, persister, wait, startedAt } = createTimedStore();
      store.dispatchPattern({ type: 'selectPattern', patternId: store.getSnapshot().patternLibrary[1]!.id });
      const title = store.getSnapshot().activePattern.title;

      store.dispatch({ type: 'toggleBall', ball: 5 });
      wait(90);
      store.dispatch({ type: 'toggleBall', ball: 17 });
      wait(30);
      store.dispatch({ type: 'showBingoBanner' });
      wait(20);
      store.dispatch({ type: 'dismissBingoBanner' });
      expect(store.getSnapshot().gameLog.records).toEqual([]);
      store.dispatch({ type: 'newGame' });
      await flushPromises();

      const log = store.getSnapshot().gameLog;
      expect(log.records).toEqual([{ id: 'game-1', startedAt, title, durationSeconds: 120 }]);
      expect(log.current).toEqual({ firstBallAt: null, lastBingoAt: null });
      expect(persister.saved.at(-1)?.gameLog.records).toHaveLength(1);
    });

    it('keeps a false bingo out of the duration', () => {
      const { store, wait } = createTimedStore();
      store.dispatch({ type: 'toggleBall', ball: 5 });
      wait(60);
      store.dispatch({ type: 'showBingoBanner' }); // false: play carries on
      wait(10);
      store.dispatch({ type: 'dismissBingoBanner' });
      store.dispatch({ type: 'toggleBall', ball: 6 });
      wait(50);
      store.dispatch({ type: 'showBingoBanner' });
      store.dispatch({ type: 'newGame' });
      expect(store.getSnapshot().gameLog.records[0]?.durationSeconds).toBe(120);
    });

    it('ends the game when New Game is confirmed if BINGO CALLED was never pressed', () => {
      const { store, wait } = createTimedStore();
      store.dispatch({ type: 'toggleBall', ball: 5 });
      wait(90);
      store.dispatch({ type: 'toggleBall', ball: 17 });
      wait(45);
      store.dispatch({ type: 'newGame' });
      expect(store.getSnapshot().gameLog.records[0]?.durationSeconds).toBe(135);
    });

    it('does not log a New Game with no calls, and a rejected command changes nothing', () => {
      const { store } = createTimedStore();
      const before = store.getSnapshot().gameLog;
      store.dispatch({ type: 'newGame' });
      store.dispatch({ type: 'toggleBall', ball: 0 as never });
      expect(store.getSnapshot().gameLog).toBe(before);
    });

    it('clears the history, persists that, and leaves the game in progress timed', async () => {
      const { store, persister, wait } = createTimedStore();
      store.dispatch({ type: 'toggleBall', ball: 5 });
      store.dispatch({ type: 'newGame' });
      wait(5);
      store.dispatch({ type: 'toggleBall', ball: 7 });
      expect(store.getSnapshot().gameLog.records).toHaveLength(1);

      store.clearGameLog();
      await flushPromises();
      expect(store.getSnapshot().gameLog.records).toEqual([]);
      expect(store.getSnapshot().gameLog.current.firstBallAt).not.toBeNull();
      expect(persister.saved.at(-1)?.gameLog.records).toEqual([]);
    });

    it('publishes and saves nothing when there is no history to clear', async () => {
      const { store, persister, snapshots } = createTimedStore();
      const saves = persister.saved.length;
      store.clearGameLog();
      await flushPromises();
      expect(snapshots).toHaveLength(0);
      expect(persister.saved).toHaveLength(saves);
    });
  });

  it('persists the Controller theme, and ignores setting the one already chosen', async () => {
    const { store, persister } = createStore();
    expect(store.getSnapshot().controllerTheme).toBe('light');
    const saves = persister.saved.length;
    store.setControllerTheme('light');
    await flushPromises();
    expect(persister.saved).toHaveLength(saves);

    store.setControllerTheme('dark');
    await flushPromises();
    expect(store.getSnapshot().controllerTheme).toBe('dark');
    expect(persister.saved.at(-1)?.settings.controllerTheme).toBe('dark');
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
    const store = new AppStore({ initialData: createDefaultAppData(), persister });
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

describe('AppStore patterns', () => {
  const CENTER = 12;

  function patternStore() {
    const persister = new FakePersister();
    let n = 0;
    const store = new AppStore({
      initialData: createDefaultAppData(),
      persister,
      now: () => new Date('2026-11-22T12:00:00.000Z'),
      newId: () => `p-${(n += 1)}`,
    });
    const snapshots: AppSnapshot[] = [];
    store.subscribe((s) => snapshots.push(s));
    return { store, persister, snapshots };
  }

  it('starts with the default library and an empty working pattern', () => {
    const { store } = patternStore();
    const snapshot = store.getSnapshot();
    expect(snapshot.patternLibrary.map((p) => p.title)).toEqual([
      'Four Corners',
      'Big L',
      'Letter X',
      'Blackout',
      'Small Diamond',
    ]);
    expect(snapshot.activePattern).toMatchObject({ sourcePatternId: null, editedFromLibrary: false });
    expect(snapshot.activePattern.cells.some(Boolean)).toBe(false);
  });

  it('applies a pattern command, bumps the revision, emits and persists', async () => {
    const { store, persister, snapshots } = patternStore();
    expect(store.dispatchPattern({ type: 'selectPattern', patternId: 'seed-big-l' })).toEqual({ ok: true });
    expect(snapshots.map((s) => s.revision)).toEqual([2]);
    expect(store.getSnapshot().activePattern).toMatchObject({
      sourcePatternId: 'seed-big-l',
      title: 'Big L',
    });
    await flushPromises();
    expect(persister.saved.at(-1)?.patterns.active.sourcePatternId).toBe('seed-big-l');
  });

  it('an edited working copy and a new library pattern are what a restart reads back', async () => {
    const { store, persister } = patternStore();
    store.dispatchPattern({ type: 'selectPattern', patternId: 'seed-big-l' });
    store.dispatchPattern({ type: 'setActivePatternCell', index: CENTER, on: true });
    store.dispatchPattern({ type: 'renameActivePattern', title: 'Big L plus' });
    store.dispatchPattern({
      type: 'createPattern',
      title: 'Everything',
      cells: Array<boolean>(25).fill(true),
    });
    await flushPromises();

    // The file as it would be on disk, read back by a fresh store.
    const onDisk = JSON.parse(JSON.stringify(persister.saved.at(-1)));
    const parsed = parsePersistedState(onDisk);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.warnings).toEqual([]);
    const restarted = new AppStore({
      initialData: fromPersistedState(parsed.state),
      persister: new FakePersister(),
    });

    expect(restarted.getSnapshot().activePattern).toEqual(store.getSnapshot().activePattern);
    expect(restarted.getSnapshot().activePattern).toMatchObject({
      title: 'Big L plus',
      editedFromLibrary: true,
    });
    expect(restarted.getSnapshot().activePattern.cells[CENTER]).toBe(true);
    expect(restarted.getSnapshot().patternLibrary).toEqual(store.getSnapshot().patternLibrary);
    expect(restarted.getSnapshot().patternLibrary.at(-1)).toMatchObject({ id: 'p-1', title: 'Everything' });
    // The saved Big L itself was never changed by the edits.
    expect(restarted.getSnapshot().patternLibrary.find((p) => p.id === 'seed-big-l')?.cells[CENTER]).toBe(
      false,
    );
  });

  it('a new game keeps the active pattern, including its title and edits', () => {
    const { store } = patternStore();
    store.dispatchPattern({ type: 'selectPattern', patternId: 'seed-big-l' });
    store.dispatchPattern({ type: 'setActivePatternCell', index: CENTER, on: true });
    store.dispatchPattern({ type: 'renameActivePattern', title: 'Big L plus' });
    store.dispatch({ type: 'toggleBall', ball: 7 });
    store.dispatch({ type: 'showBingoBanner' });
    const patternBefore = store.getSnapshot().activePattern;
    const libraryBefore = store.getSnapshot().patternLibrary;

    store.dispatch({ type: 'newGame' });

    expect(store.getSnapshot().game).toEqual({
      calledNumbers: [],
      bingoBannerVisible: false,
      disabledRows: [],
    });
    expect(store.getSnapshot().activePattern).toBe(patternBefore);
    expect(store.getSnapshot().patternLibrary).toBe(libraryBefore);
    expect(store.getSnapshot().activePattern).toMatchObject({ title: 'Big L plus', editedFromLibrary: true });
  });

  it('pattern commands never change the game or the presentation mode, and vice versa', () => {
    const { store } = patternStore();
    store.dispatch({ type: 'toggleBall', ball: 7 });
    store.setPresentationMode('slideshow');
    const game = store.getSnapshot().game;
    store.dispatchPattern({ type: 'selectPattern', patternId: 'seed-four-corners' });
    expect(store.getSnapshot().game).toBe(game);
    expect(store.getSnapshot().presentationMode).toBe('slideshow');

    const pattern = store.getSnapshot().activePattern;
    store.setPresentationMode('gameBoard');
    expect(store.getSnapshot().activePattern).toBe(pattern);
  });

  it('rejects an invalid command without changing state, revision or saving', async () => {
    const { store, persister, snapshots } = patternStore();
    for (const command of [
      { type: 'setActivePatternCell', index: 25, on: true },
      { type: 'selectPattern', patternId: 'nope' },
      { type: 'renameActivePattern', title: '' },
    ] as const) {
      expect(store.dispatchPattern(command).ok).toBe(false);
    }
    await flushPromises();
    expect(snapshots).toHaveLength(0);
    expect(store.getSnapshot().revision).toBe(1);
    expect(persister.saved).toHaveLength(0);
  });

  it('publishes and saves nothing when a command changes nothing', async () => {
    const { store, persister, snapshots } = patternStore();
    store.dispatchPattern({ type: 'setActivePatternCell', index: 3, on: false }); // already off
    await flushPromises();
    expect(snapshots).toHaveLength(0);
    expect(persister.saved).toHaveLength(0);
  });

  it('stamps new patterns with the store clock and id source', () => {
    const { store } = patternStore();
    store.dispatchPattern({ type: 'duplicatePattern', patternId: 'seed-big-l' });
    expect(store.getSnapshot().patternLibrary.find((p) => p.id === 'p-1')).toMatchObject({
      title: 'Big L (copy)',
      createdAt: '2026-11-22T12:00:00.000Z',
    });
  });
});

describe('AppStore media', () => {
  const ID_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const entry = (id: string) => ({
    id,
    name: 'Logo.png',
    format: 'png' as const,
    bytes: 100,
    width: 10,
    height: 10,
    addedAt: '2026-01-01T00:00:00.000Z',
    fit: 'fit' as const,
  });

  it('starts empty, with nothing chosen', () => {
    const { store } = createStore();
    expect(store.getSnapshot().mediaLibrary).toEqual([]);
    expect(store.getSnapshot().singleImage).toEqual({ imageId: null });
  });

  it('adds, chooses and saves: one snapshot and one save per accepted command', async () => {
    const { store, persister, snapshots } = createStore();
    expect(store.dispatchMedia({ type: 'addMedia', items: [entry(ID_A)] })).toEqual({ ok: true });
    expect(store.dispatchMedia({ type: 'selectSingleImage', mediaId: ID_A })).toEqual({ ok: true });
    expect(store.dispatchMedia({ type: 'setImageFit', mediaId: ID_A, fit: 'fill' })).toEqual({ ok: true });
    await flushPromises();
    expect(snapshots).toHaveLength(3);
    expect(store.getSnapshot().singleImage).toEqual({ imageId: ID_A });
    expect(store.getSnapshot().mediaLibrary[0]?.fit).toBe('fill');
    const lastSaved = persister.saved.at(-1);
    expect(lastSaved?.media.library.map((item) => item.id)).toEqual([ID_A]);
    expect(lastSaved?.media.singleImage).toEqual({ imageId: ID_A });
    // Each image's own setting is saved with it.
    expect(lastSaved?.media.library[0]?.fit).toBe('fill');
  });

  it('refuses an invalid command and leaves state, snapshot and saves alone', async () => {
    const { store, persister, snapshots } = createStore();
    const before = store.getSnapshot();
    const result = store.dispatchMedia({ type: 'selectSingleImage', mediaId: ID_A });
    expect(result.ok).toBe(false);
    expect(store.getSnapshot()).toBe(before);
    await flushPromises();
    expect(snapshots).toHaveLength(0);
    expect(persister.saved).toHaveLength(0);
  });

  it('a command that changes nothing publishes and saves nothing', async () => {
    const { store, persister, snapshots } = createStore();
    store.dispatchMedia({ type: 'addMedia', items: [entry(ID_A)] });
    await flushPromises();
    const published = snapshots.length;
    const saved = persister.saved.length;
    // The image is already Fit, so setting Fit again is nothing.
    store.dispatchMedia({ type: 'setImageFit', mediaId: ID_A, fit: 'fit' });
    await flushPromises();
    expect(snapshots).toHaveLength(published);
    expect(persister.saved).toHaveLength(saved);
  });

  it('is not touched by the game, patterns or presentation mode', () => {
    const { store } = createStore();
    store.dispatchMedia({ type: 'addMedia', items: [entry(ID_A)] });
    store.dispatchMedia({ type: 'selectSingleImage', mediaId: ID_A });
    const media = { library: store.getSnapshot().mediaLibrary, singleImage: store.getSnapshot().singleImage };
    store.dispatch({ type: 'toggleBall', ball: 7 });
    store.dispatch({ type: 'newGame' });
    store.dispatchPattern({ type: 'selectPattern', patternId: 'seed-big-l' });
    store.setPresentationMode('singleImage');
    expect(store.getSnapshot().mediaLibrary).toBe(media.library);
    expect(store.getSnapshot().singleImage).toBe(media.singleImage);
  });

  it('restores the library and the choice from saved data', () => {
    const initialData = {
      ...createDefaultAppData(),
      media: { library: [entry(ID_A)], singleImage: { imageId: ID_A } },
    };
    const store = new AppStore({ initialData, persister: new FakePersister() });
    expect(store.getSnapshot().mediaLibrary).toEqual([entry(ID_A)]);
    expect(store.getSnapshot().singleImage).toEqual({ imageId: ID_A });
  });
});
