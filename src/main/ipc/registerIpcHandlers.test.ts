import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcChannel, ok, type CommandResult } from '../../shared/ipc/contract';
import { createDefaultAppData } from '../persistence/persistedState';
import { AppStore } from '../state/appStore';
import {
  registerIpcHandlers,
  type IpcDependencies,
  type IpcEventLike,
  type IpcMainLike,
} from './registerIpcHandlers';

const CONTROLLER_ID = 1;
const PRESENTATION_ID = 2;
const STRANGER_ID = 99;

class FakeIpcMain implements IpcMainLike {
  handlers = new Map<string, (event: IpcEventLike, ...args: unknown[]) => unknown>();
  removed: string[] = [];
  handle(channel: string, listener: (event: IpcEventLike, ...args: unknown[]) => unknown): void {
    if (this.handlers.has(channel)) throw new Error(`second handler for ${channel}`);
    this.handlers.set(channel, listener);
  }
  removeHandler(channel: string): void {
    this.removed.push(channel);
    this.handlers.delete(channel);
  }
  invoke(senderId: number, channel: string, ...args: unknown[]): unknown {
    const handler = this.handlers.get(channel);
    if (!handler) throw new Error(`no handler for ${channel}`);
    return handler({ sender: { id: senderId } }, ...args);
  }
}

function setup() {
  const ipc = new FakeIpcMain();
  const store = new AppStore({
    initialData: createDefaultAppData(),
    persister: { save: async () => undefined },
  });
  const deps: IpcDependencies = {
    store,
    media: {
      importImages: vi.fn(async (): Promise<CommandResult> => ok),
      deleteFile: vi.fn(async () => undefined),
    },
    presentation: {
      openOnDisplay: vi.fn((): CommandResult => ok),
      openPreview: vi.fn((): CommandResult => ok),
      close: vi.fn((): CommandResult => ok),
    },
    displays: { refresh: vi.fn(() => []) },
    senders: {
      isController: (id) => id === CONTROLLER_ID,
      isAppWindow: (id) => id === CONTROLLER_ID || id === PRESENTATION_ID,
    },
  };
  registerIpcHandlers(ipc, deps);
  return { ipc, store, deps };
}

describe('registerIpcHandlers', () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  describe('countdown commands', () => {
    const invoke = (channel: string, ...args: unknown[]) =>
      ctx.ipc.invoke(CONTROLLER_ID, channel, ...args) as CommandResult;

    it('validates and applies the Controller commands through the store', () => {
      expect(invoke(IpcChannel.setTimerDuration, 90)).toEqual(ok);
      expect(invoke(IpcChannel.setCountdownMessage, ' Next round ')).toEqual(ok);
      expect(invoke(IpcChannel.startTimer)).toEqual(ok);
      expect(ctx.store.getSnapshot().timer).toMatchObject({
        status: 'running',
        durationSeconds: 90,
        message: 'Next round',
      });
      expect(invoke(IpcChannel.setTimerDuration, 60).ok).toBe(false);
      expect(invoke(IpcChannel.pauseTimer)).toEqual(ok);
      expect(ctx.store.getSnapshot().timer.status).toBe('paused');
      expect(invoke(IpcChannel.resumeTimer)).toEqual(ok);
      expect(ctx.store.getSnapshot().timer.status).toBe('running');
      expect(invoke(IpcChannel.resetTimer)).toEqual(ok);
      expect(ctx.store.getSnapshot().timer).toEqual({
        status: 'idle',
        durationSeconds: 90,
        message: 'Next round',
      });
    });

    const commands = [
      [IpcChannel.setTimerDuration, [60]],
      [IpcChannel.setCountdownMessage, ['Next round']],
      [IpcChannel.startTimer, []],
      [IpcChannel.pauseTimer, []],
      [IpcChannel.resumeTimer, []],
      [IpcChannel.resetTimer, []],
    ] as const;

    it.each(commands)('%s is Controller-only and rejects unexpected arguments', (channel, args) => {
      const before = ctx.store.getSnapshot();
      for (const sender of [PRESENTATION_ID, STRANGER_ID]) {
        expect(ctx.ipc.invoke(sender, channel, ...args)).toMatchObject({ ok: false });
      }
      expect(invoke(channel, ...args, null).ok).toBe(false);
      expect(ctx.store.getSnapshot()).toBe(before);
    });

    it.each([undefined, null, '60', 0, 1.5, 6000, NaN, Infinity])('refuses duration %j', (value) => {
      expect(invoke(IpcChannel.setTimerDuration, value).ok).toBe(false);
      expect(ctx.store.getSnapshot().revision).toBe(1);
    });

    it.each([undefined, null, 42, '', ' ', 'x'.repeat(81)])('refuses message %j', (value) => {
      expect(invoke(IpcChannel.setCountdownMessage, value).ok).toBe(false);
      expect(ctx.store.getSnapshot().revision).toBe(1);
    });
  });

  it('can be registered twice without throwing', () => {
    expect(() => registerIpcHandlers(ctx.ipc, ctx.deps)).not.toThrow();
  });

  it('serves snapshots to any app window but not to strangers', () => {
    expect(ctx.ipc.invoke(PRESENTATION_ID, IpcChannel.getSnapshot)).toBe(ctx.store.getSnapshot());
    expect(() => ctx.ipc.invoke(STRANGER_ID, IpcChannel.getSnapshot)).toThrow(/unknown sender/);
  });

  it('toggles balls from the Controller', () => {
    expect(ctx.ipc.invoke(CONTROLLER_ID, IpcChannel.toggleBall, 3)).toEqual({ ok: true });
    expect(ctx.store.getSnapshot().game.calledNumbers).toEqual([3]);
  });

  it('rejects commands from the Presentation window', () => {
    const result = ctx.ipc.invoke(PRESENTATION_ID, IpcChannel.toggleBall, 3) as CommandResult;
    expect(result.ok).toBe(false);
    expect(ctx.store.getSnapshot().game.calledNumbers).toEqual([]);
  });

  it.each([0, 76, 2.5, '3', null, undefined, { ball: 3 }])('rejects invalid ball argument %j', (arg) => {
    const result = ctx.ipc.invoke(CONTROLLER_ID, IpcChannel.toggleBall, arg) as CommandResult;
    expect(result.ok).toBe(false);
    expect(ctx.store.getSnapshot().game.calledNumbers).toEqual([]);
  });

  describe('blacked-out rows', () => {
    it('toggles a row from the Controller, and never touches the calls', () => {
      ctx.ipc.invoke(CONTROLLER_ID, IpcChannel.toggleBall, 3);
      expect(ctx.ipc.invoke(CONTROLLER_ID, IpcChannel.toggleRowDisabled, 'N')).toEqual({ ok: true });
      expect(ctx.store.getSnapshot().game.disabledRows).toEqual(['N']);
      expect(ctx.store.getSnapshot().game.calledNumbers).toEqual([3]);
      expect(ctx.ipc.invoke(CONTROLLER_ID, IpcChannel.toggleRowDisabled, 'N')).toEqual({ ok: true });
      expect(ctx.store.getSnapshot().game.disabledRows).toEqual([]);
    });

    it('rejects a ball in a blacked-out row, leaving the calls alone, and accepts it once the row is back', () => {
      ctx.ipc.invoke(CONTROLLER_ID, IpcChannel.toggleRowDisabled, 'N');
      const before = ctx.store.getSnapshot();
      const result = ctx.ipc.invoke(CONTROLLER_ID, IpcChannel.toggleBall, 33) as CommandResult;
      expect(result.ok).toBe(false);
      expect(!result.ok && result.error).toMatch(/N row is blacked out/);
      expect(ctx.store.getSnapshot()).toBe(before);

      ctx.ipc.invoke(CONTROLLER_ID, IpcChannel.toggleRowDisabled, 'N');
      expect(ctx.ipc.invoke(CONTROLLER_ID, IpcChannel.toggleBall, 33)).toEqual({ ok: true });
      expect(ctx.store.getSnapshot().game.calledNumbers).toEqual([33]);
    });

    it('rejects it from the Presentation window and from strangers, changing nothing', () => {
      const before = ctx.store.getSnapshot();
      expect((ctx.ipc.invoke(PRESENTATION_ID, IpcChannel.toggleRowDisabled, 'B') as CommandResult).ok).toBe(
        false,
      );
      expect((ctx.ipc.invoke(STRANGER_ID, IpcChannel.toggleRowDisabled, 'B') as CommandResult).ok).toBe(
        false,
      );
      expect(ctx.store.getSnapshot()).toBe(before);
    });

    it.each(['X', 'b', '', 'BI', 3, null, undefined, ['B']])('rejects %j as a row', (arg) => {
      const before = ctx.store.getSnapshot();
      expect((ctx.ipc.invoke(CONTROLLER_ID, IpcChannel.toggleRowDisabled, arg) as CommandResult).ok).toBe(
        false,
      );
      expect(ctx.store.getSnapshot()).toBe(before);
    });
  });

  describe('BINGO banner and new game', () => {
    const channels = [IpcChannel.showBingoBanner, IpcChannel.dismissBingoBanner, IpcChannel.newGame];

    it.each(channels)('rejects %s from the Presentation window and leaves the game untouched', (channel) => {
      ctx.store.dispatch({ type: 'toggleBall', ball: 7 });
      const before = ctx.store.getSnapshot();
      const result = ctx.ipc.invoke(PRESENTATION_ID, channel) as CommandResult;
      expect(result.ok).toBe(false);
      expect(ctx.store.getSnapshot()).toBe(before);
    });

    it.each(channels)('rejects %s from an unknown sender', (channel) => {
      expect((ctx.ipc.invoke(STRANGER_ID, channel) as CommandResult).ok).toBe(false);
    });

    it('accepts show, dismiss and new game from the Controller', () => {
      ctx.ipc.invoke(CONTROLLER_ID, IpcChannel.toggleBall, 3);
      ctx.ipc.invoke(CONTROLLER_ID, IpcChannel.toggleBall, 9);

      expect(ctx.ipc.invoke(CONTROLLER_ID, IpcChannel.showBingoBanner)).toEqual({ ok: true });
      expect(ctx.store.getSnapshot().game).toEqual({
        calledNumbers: [3, 9],
        bingoBannerVisible: true,
        disabledRows: [],
      });

      expect(ctx.ipc.invoke(CONTROLLER_ID, IpcChannel.dismissBingoBanner)).toEqual({ ok: true });
      expect(ctx.store.getSnapshot().game).toEqual({
        calledNumbers: [3, 9],
        bingoBannerVisible: false,
        disabledRows: [],
      });

      ctx.ipc.invoke(CONTROLLER_ID, IpcChannel.showBingoBanner);
      expect(ctx.ipc.invoke(CONTROLLER_ID, IpcChannel.newGame)).toEqual({ ok: true });
      expect(ctx.store.getSnapshot().game).toEqual({
        calledNumbers: [],
        bingoBannerVisible: false,
        disabledRows: [],
      });
    });

    it('showing the banner twice publishes only one snapshot', () => {
      ctx.ipc.invoke(CONTROLLER_ID, IpcChannel.showBingoBanner);
      const revision = ctx.store.getSnapshot().revision;
      ctx.ipc.invoke(CONTROLLER_ID, IpcChannel.showBingoBanner);
      expect(ctx.store.getSnapshot().revision).toBe(revision);
    });
  });

  describe('presentation mode', () => {
    it('is set from the Controller and leaves every game field alone', () => {
      ctx.ipc.invoke(CONTROLLER_ID, IpcChannel.toggleBall, 3);
      ctx.ipc.invoke(CONTROLLER_ID, IpcChannel.showBingoBanner);
      const gameBefore = ctx.store.getSnapshot().game;

      expect(ctx.ipc.invoke(CONTROLLER_ID, IpcChannel.setPresentationMode, 'countdown')).toEqual({
        ok: true,
      });
      expect(ctx.store.getSnapshot().presentationMode).toBe('countdown');
      expect(ctx.store.getSnapshot().game).toBe(gameBefore);
    });

    it('is rejected from the Presentation window', () => {
      const result = ctx.ipc.invoke(PRESENTATION_ID, IpcChannel.setPresentationMode, 'slideshow');
      expect((result as CommandResult).ok).toBe(false);
      expect(ctx.store.getSnapshot().presentationMode).toBe('gameBoard');
    });

    it.each(['photos', '', 'GameBoard', 3, null, undefined, { mode: 'slideshow' }])(
      'rejects the invalid mode %j without changing anything',
      (mode) => {
        const before = ctx.store.getSnapshot();
        const result = ctx.ipc.invoke(CONTROLLER_ID, IpcChannel.setPresentationMode, mode) as CommandResult;
        expect(result.ok).toBe(false);
        expect(ctx.store.getSnapshot()).toBe(before);
      },
    );
  });

  it('validates display ids before opening a presentation', () => {
    const bad = ctx.ipc.invoke(CONTROLLER_ID, IpcChannel.openPresentation, 'primary') as CommandResult;
    expect(bad.ok).toBe(false);
    expect(ctx.deps.presentation.openOnDisplay).not.toHaveBeenCalled();

    ctx.ipc.invoke(CONTROLLER_ID, IpcChannel.openPresentation, 12345);
    expect(ctx.deps.presentation.openOnDisplay).toHaveBeenCalledWith(12345);
  });

  it('turns thrown errors into failed results', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(ctx.deps.presentation.openPreview).mockImplementation(() => {
      throw new Error('window exploded');
    });
    expect(ctx.ipc.invoke(CONTROLLER_ID, IpcChannel.openPreview)).toEqual({
      ok: false,
      error: 'window exploded',
    });
  });

  it('dismisses notices with a valid id only', () => {
    ctx.store.addNotice({ id: 'x', level: 'info', message: 'hello' });
    expect((ctx.ipc.invoke(CONTROLLER_ID, IpcChannel.dismissNotice, 5) as CommandResult).ok).toBe(false);
    expect(ctx.ipc.invoke(CONTROLLER_ID, IpcChannel.dismissNotice, 'x')).toEqual({ ok: true });
    expect(ctx.store.getSnapshot().notices).toEqual([]);
  });

  it('restricts listDisplays to the Controller', () => {
    expect(ctx.ipc.invoke(CONTROLLER_ID, IpcChannel.listDisplays)).toEqual([]);
    expect(() => ctx.ipc.invoke(PRESENTATION_ID, IpcChannel.listDisplays)).toThrow();
  });
});

describe('pattern commands over IPC', () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  const invoke = (channel: string, ...args: unknown[]) =>
    ctx.ipc.invoke(CONTROLLER_ID, channel, ...args) as CommandResult;
  const snapshot = () => ctx.store.getSnapshot();
  const SOME_ID = 'seed-big-l';

  // One valid call for each channel.
  const validCalls: ReadonlyArray<[string, unknown[]]> = [
    [IpcChannel.selectPattern, [SOME_ID]],
    [IpcChannel.setActivePatternCell, [12, true]],
    [IpcChannel.renameActivePattern, ['Renamed']],
    [IpcChannel.updateSavedPattern, []],
    [IpcChannel.saveActivePatternAsNew, ['Saved']],
    [IpcChannel.createPattern, ['Plain', Array(25).fill(false)]],
    [IpcChannel.renamePattern, [SOME_ID, 'Hook']],
    [IpcChannel.duplicatePattern, [SOME_ID]],
    [IpcChannel.deletePattern, [SOME_ID]],
    [IpcChannel.showPatternOnProjector, []],
    [IpcChannel.hidePatternOnProjector, []],
  ];

  it.each(validCalls)(
    '%s is rejected from the Presentation window and from strangers, changing nothing',
    (channel, args) => {
      ctx.ipc.invoke(CONTROLLER_ID, IpcChannel.selectPattern, SOME_ID);
      const before = snapshot();
      expect((ctx.ipc.invoke(PRESENTATION_ID, channel, ...args) as CommandResult).ok).toBe(false);
      expect((ctx.ipc.invoke(STRANGER_ID, channel, ...args) as CommandResult).ok).toBe(false);
      expect(snapshot()).toBe(before);
    },
  );

  it('accepts the whole pattern workflow from the Controller', () => {
    expect(invoke(IpcChannel.selectPattern, SOME_ID)).toEqual({ ok: true });
    expect(invoke(IpcChannel.setActivePatternCell, 12, true)).toEqual({ ok: true });
    expect(snapshot().activePattern).toMatchObject({ sourcePatternId: SOME_ID, editedFromLibrary: true });
    expect(snapshot().activePattern.cells[12]).toBe(true);
    expect(snapshot().patternLibrary.find((p) => p.id === SOME_ID)?.cells[12]).toBe(false);

    expect(invoke(IpcChannel.renameActivePattern, 'Big L plus')).toEqual({ ok: true });
    expect(invoke(IpcChannel.updateSavedPattern)).toEqual({ ok: true });
    expect(snapshot().patternLibrary.find((p) => p.id === SOME_ID)).toMatchObject({ title: 'Big L plus' });
    expect(snapshot().activePattern.editedFromLibrary).toBe(false);

    const before = snapshot().patternLibrary.length;
    expect(invoke(IpcChannel.saveActivePatternAsNew)).toEqual({ ok: true });
    expect(invoke(IpcChannel.duplicatePattern, SOME_ID)).toEqual({ ok: true });
    expect(invoke(IpcChannel.createPattern, 'Plain', Array(25).fill(false))).toEqual({ ok: true });
    expect(snapshot().patternLibrary).toHaveLength(before + 3);
    const toDelete = snapshot().patternLibrary.at(-1)?.id ?? '';
    expect(invoke(IpcChannel.renamePattern, toDelete, 'Gone soon')).toEqual({ ok: true });
    expect(invoke(IpcChannel.deletePattern, toDelete)).toEqual({ ok: true });
    expect(snapshot().patternLibrary).toHaveLength(before + 2);
  });

  describe('validation', () => {
    it.each([-1, 25, 100, 1.5, Number.NaN, '3', null, undefined, {}])(
      'accepts only cells 0 to 24, not %j',
      (index) => {
        const before = snapshot();
        expect(invoke(IpcChannel.setActivePatternCell, index, true).ok).toBe(false);
        expect(snapshot()).toBe(before);
      },
    );

    it.each([0, 12, 24])('accepts the cell %j (the center is an ordinary cell)', (index) => {
      expect(invoke(IpcChannel.setActivePatternCell, index, true)).toEqual({ ok: true });
      expect(snapshot().activePattern.cells[index]).toBe(true);
    });

    it.each(['true', 1, 0, null, undefined])('requires the on/off flag to be a boolean, not %j', (on) => {
      expect(invoke(IpcChannel.setActivePatternCell, 3, on).ok).toBe(false);
    });

    it('limits titles to 1 to 60 characters', () => {
      const before = snapshot();
      for (const title of ['', '   ', 'x'.repeat(61)]) {
        expect(invoke(IpcChannel.renameActivePattern, title).ok, `rename ${title.length}`).toBe(false);
        expect(
          invoke(IpcChannel.createPattern, title, Array(25).fill(false)).ok,
          `create ${title.length}`,
        ).toBe(false);
        expect(invoke(IpcChannel.renamePattern, SOME_ID, title).ok, `rename saved ${title.length}`).toBe(
          false,
        );
      }
      expect(snapshot()).toBe(before);
      expect(invoke(IpcChannel.renameActivePattern, 'x'.repeat(60))).toEqual({ ok: true });
      expect(snapshot().activePattern.title).toHaveLength(60);
    });

    it.each([42, null, {}, ['a']])('requires a title to be text, not %j', (title) => {
      expect(invoke(IpcChannel.renameActivePattern, title).ok).toBe(false);
      expect(invoke(IpcChannel.saveActivePatternAsNew, title).ok).toBe(false);
    });

    it.each([IpcChannel.selectPattern, IpcChannel.duplicatePattern, IpcChannel.deletePattern])(
      '%s rejects unknown and malformed ids',
      (channel) => {
        const before = snapshot();
        for (const id of ['no-such-pattern', '', 7, null, undefined, {}, 'x'.repeat(201)]) {
          expect(invoke(channel, id).ok, `${channel} ${String(id).slice(0, 20)}`).toBe(false);
        }
        expect(snapshot()).toBe(before);
      },
    );

    it('rejects renaming an unknown saved pattern', () => {
      expect(invoke(IpcChannel.renamePattern, 'no-such-pattern', 'X').ok).toBe(false);
      expect(invoke(IpcChannel.renamePattern, 5, 'X').ok).toBe(false);
    });

    it.each([
      [true],
      [Array(24).fill(false)],
      [Array(26).fill(false)],
      [Array(25).fill(1)],
      [null],
      [undefined],
      ['x'.repeat(25)],
    ])('requires exactly 25 true/false cells to create a pattern, not %j', (cells) => {
      const before = snapshot();
      expect(invoke(IpcChannel.createPattern, 'Bad', cells).ok).toBe(false);
      expect(snapshot()).toBe(before);
    });

    it('cannot update the saved pattern when the working copy is not from the library', () => {
      expect(invoke(IpcChannel.updateSavedPattern).ok).toBe(false);
    });
  });
});

describe('image commands over IPC', () => {
  const ID_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const ID_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
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
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
    ctx.store.dispatchMedia({ type: 'addMedia', items: [entry(ID_A), entry(ID_B)] });
  });

  const invoke = (channel: string, ...args: unknown[]) =>
    ctx.ipc.invoke(CONTROLLER_ID, channel, ...args) as CommandResult;

  describe('editSlideshow', () => {
    const edit = (command: unknown) => invoke(IpcChannel.editSlideshow, command);

    it('edits imported slides and removes only their app-owned copies after saving', async () => {
      expect(edit({ type: 'create', name: 'Sponsors' })).toEqual(ok);
      const collectionId = ctx.store.getSnapshot().slideshow.activeId;
      if (!collectionId) throw new Error('No collection was created.');
      const first = entry('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
      const second = entry('dddddddd-dddd-4ddd-8ddd-dddddddddddd');
      expect(ctx.store.addSlideshowImages(collectionId, [first, second])).toEqual(ok);
      for (const command of [
        { type: 'rename', name: 'Announcements' },
        { type: 'select', collectionId: null },
        { type: 'select' },
        { type: 'setInterval', secondsPerSlide: 15 },
        { type: 'setFit', fit: 'fill' },
        { type: 'moveSlide', mediaId: second.id, direction: 'up' },
        { type: 'setSlideFit', mediaId: second.id, fit: 'original' },
        { type: 'removeSlide', mediaId: first.id },
      ]) {
        expect(edit({ collectionId, ...command })).toEqual(ok);
      }
      expect(ctx.store.getSnapshot().slideshow).toEqual({
        activeId: collectionId,
        collections: [
          {
            id: collectionId,
            name: 'Announcements',
            secondsPerSlide: 15,
            fit: 'fill',
            slides: [{ mediaId: second.id, fit: 'original', image: second }],
          },
        ],
      });
      expect(invoke(IpcChannel.selectSingleImage, second.id).ok).toBe(false);
      expect(invoke(IpcChannel.removeImage, second.id).ok).toBe(false);
      expect(edit({ type: 'delete', collectionId })).toEqual(ok);
      expect(ctx.store.getAppData().slideshow).toEqual({ activeId: null, collections: [] });
      expect(ctx.store.getSnapshot().mediaLibrary.map(({ id }) => id)).toEqual([ID_A, ID_B]);
      await vi.waitFor(() => expect(ctx.deps.media.deleteFile).toHaveBeenCalledTimes(2));
      expect(ctx.deps.media.deleteFile).toHaveBeenCalledWith(first);
      expect(ctx.deps.media.deleteFile).toHaveBeenCalledWith(second);
    });

    it('refuses non-Controller senders, wrong arity and malformed payloads', () => {
      const before = ctx.store.getSnapshot();
      const command = { type: 'create', name: 'Sponsors' };
      for (const sender of [PRESENTATION_ID, STRANGER_ID]) {
        expect(ctx.ipc.invoke(sender, IpcChannel.editSlideshow, command)).toMatchObject({ ok: false });
      }
      expect(invoke(IpcChannel.editSlideshow).ok).toBe(false);
      expect(invoke(IpcChannel.editSlideshow, command, null).ok).toBe(false);
      for (const invalid of [
        null,
        {},
        { ...command, extra: true },
        { type: 'setInterval', collectionId: ID_A, secondsPerSlide: '10' },
      ]) {
        expect(edit(invalid).ok).toBe(false);
      }
      expect(ctx.store.getSnapshot()).toBe(before);
    });
  });

  it('restricts playback to the Controller and validates slide ids and commands', () => {
    const send = (command: unknown) => invoke(IpcChannel.controlSlideshow, command);
    expect(invoke(IpcChannel.editSlideshow, { type: 'create', name: 'Sponsors' })).toEqual(ok);
    const collectionId = ctx.store.getSnapshot().slideshow.activeId;
    if (!collectionId) throw new Error('No collection was created.');
    const image = entry('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
    expect(ctx.store.addSlideshowImages(collectionId, [image])).toEqual(ok);
    expect(send({ type: 'start' }).ok).toBe(false);
    ctx.store.setPresentationMode('slideshow');
    const before = ctx.store.getSnapshot();
    expect(ctx.ipc.invoke(PRESENTATION_ID, IpcChannel.controlSlideshow, { type: 'start' })).toMatchObject({
      ok: false,
    });
    expect(invoke(IpcChannel.controlSlideshow, { type: 'start' }, null).ok).toBe(false);
    expect(send({ type: 'advance' }).ok).toBe(false);
    expect(send({ type: 'hold', mediaId: 'unknown' }).ok).toBe(false);
    expect(send({ type: 'hold', mediaId: ID_A }).ok).toBe(false);
    expect(ctx.store.getSnapshot()).toBe(before);
    expect(send({ type: 'start' })).toEqual(ok);
    expect(ctx.store.dispatchTimer({ type: 'start' })).toEqual(ok);
    const running = ctx.store.getSnapshot();
    expect(invoke(IpcChannel.editSlideshow, { type: 'setCountdownVisible', visible: false })).toEqual(ok);
    expect(ctx.store.getSnapshot().slideshow.showCountdown).toBe(false);
    expect(ctx.store.getSnapshot().timer).toBe(running.timer);
    expect(ctx.store.getSnapshot().slideshowPlayback).toBe(running.slideshowPlayback);
    expect(send({ type: 'hold', mediaId: image.id })).toEqual(ok);
    expect(ctx.store.getSnapshot().slideshowPlayback).toEqual({ status: 'held', mediaId: image.id });
    expect(send({ type: 'continue' })).toEqual(ok);
    expect(ctx.store.getSnapshot().slideshowPlayback).toMatchObject({ status: 'playing', mediaId: image.id });
    expect(send({ type: 'stop' })).toEqual(ok);
    expect(ctx.store.getSnapshot().slideshowPlayback).toEqual({ status: 'stopped', mediaId: image.id });
  });

  it('opens the picker for the specified collection only after validating the sender and ID', async () => {
    expect(invoke(IpcChannel.editSlideshow, { type: 'create', name: 'Sponsors' })).toEqual(ok);
    const collectionId = ctx.store.getSnapshot().slideshow.activeId;
    expect(invoke(IpcChannel.importSlideshowImages, 'not an id').ok).toBe(false);
    expect(invoke(IpcChannel.importSlideshowImages, ID_A).ok).toBe(false);
    expect(invoke(IpcChannel.importSlideshowImages, collectionId, 'extra').ok).toBe(false);
    expect(ctx.ipc.invoke(PRESENTATION_ID, IpcChannel.importSlideshowImages, collectionId)).toMatchObject({
      ok: false,
    });
    expect(ctx.deps.media.importImages).not.toHaveBeenCalled();
    expect(await invoke(IpcChannel.importSlideshowImages, collectionId)).toEqual(ok);
    expect(ctx.deps.media.importImages).toHaveBeenCalledExactlyOnceWith(collectionId);
  });

  describe('importImages', () => {
    it('hands over to the media service from the Controller and returns its answer', async () => {
      const answer = await (ctx.ipc.invoke(CONTROLLER_ID, IpcChannel.importImages) as Promise<CommandResult>);
      expect(answer).toEqual({ ok: true });
      expect(ctx.deps.media.importImages).toHaveBeenCalledTimes(1);
    });

    it('passes a failure message through', async () => {
      vi.mocked(ctx.deps.media.importImages).mockResolvedValueOnce({
        ok: false,
        error: 'No images were added.',
      });
      const answer = await (ctx.ipc.invoke(CONTROLLER_ID, IpcChannel.importImages) as Promise<CommandResult>);
      expect(answer).toEqual({ ok: false, error: 'No images were added.' });
    });

    it('turns a service that throws into a failed result instead of an IPC error', async () => {
      vi.mocked(ctx.deps.media.importImages).mockRejectedValueOnce(new Error('disk exploded'));
      const answer = await (ctx.ipc.invoke(CONTROLLER_ID, IpcChannel.importImages) as Promise<CommandResult>);
      expect(answer).toEqual({ ok: false, error: 'disk exploded' });
    });
  });

  describe('selectSingleImage', () => {
    it('chooses an image, and clears the choice', () => {
      expect(invoke(IpcChannel.selectSingleImage, ID_B)).toEqual({ ok: true });
      expect(ctx.store.getSnapshot().singleImage.imageId).toBe(ID_B);
      expect(invoke(IpcChannel.selectSingleImage, null)).toEqual({ ok: true });
      expect(ctx.store.getSnapshot().singleImage.imageId).toBeNull();
    });

    it.each(['nope', '', 7, undefined, { id: ID_A }, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'])(
      'rejects %j as an image to show, changing nothing',
      (arg) => {
        const before = ctx.store.getSnapshot();
        expect(invoke(IpcChannel.selectSingleImage, arg).ok).toBe(false);
        expect(ctx.store.getSnapshot()).toBe(before);
      },
    );
  });

  describe('setImageFit', () => {
    it('sets one image to Fit, Fill or Original, and no other', () => {
      expect(invoke(IpcChannel.setImageFit, ID_B, 'fill')).toEqual({ ok: true });
      expect(ctx.store.getSnapshot().mediaLibrary.map((item) => item.fit)).toEqual(['fit', 'fill']);
      expect(invoke(IpcChannel.setImageFit, ID_A, 'original')).toEqual({ ok: true });
      expect(ctx.store.getSnapshot().mediaLibrary.map((item) => item.fit)).toEqual(['original', 'fill']);
    });

    it.each(['stretch', 'FIT', '', 1, null, undefined])('rejects %j as a mode, changing nothing', (arg) => {
      const before = ctx.store.getSnapshot();
      expect(invoke(IpcChannel.setImageFit, ID_A, arg).ok).toBe(false);
      expect(ctx.store.getSnapshot()).toBe(before);
    });

    it.each(['nope', '', 7, null, undefined, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'])(
      'rejects %j as an image, changing nothing',
      (arg) => {
        const before = ctx.store.getSnapshot();
        expect(invoke(IpcChannel.setImageFit, arg, 'fill').ok).toBe(false);
        expect(ctx.store.getSnapshot()).toBe(before);
      },
    );
  });

  describe('removeImage', () => {
    it('removes the image, clears it if it was shown, and has its file deleted', () => {
      invoke(IpcChannel.selectSingleImage, ID_A);
      expect(invoke(IpcChannel.removeImage, ID_A)).toEqual({ ok: true });
      expect(ctx.store.getSnapshot().mediaLibrary.map((item) => item.id)).toEqual([ID_B]);
      expect(ctx.store.getSnapshot().singleImage.imageId).toBeNull();
      expect(ctx.deps.media.deleteFile).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ id: ID_A }),
      );
    });

    it.each(['nope', '', 7, null, undefined, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'])(
      'rejects %j, deleting nothing',
      (arg) => {
        const before = ctx.store.getSnapshot();
        expect(invoke(IpcChannel.removeImage, arg).ok).toBe(false);
        expect(ctx.store.getSnapshot()).toBe(before);
        expect(ctx.deps.media.deleteFile).not.toHaveBeenCalled();
      },
    );
  });

  it.each([
    [IpcChannel.importImages, []],
    [IpcChannel.selectSingleImage, [ID_A]],
    [IpcChannel.setImageFit, [ID_A, 'fill']],
    [IpcChannel.removeImage, [ID_A]],
  ])(
    '%s is rejected from the Presentation window and from strangers, changing nothing',
    async (channel, args) => {
      const before = ctx.store.getSnapshot();
      for (const sender of [PRESENTATION_ID, STRANGER_ID]) {
        const answer = await (ctx.ipc.invoke(sender, channel, ...args) as
          | CommandResult
          | Promise<CommandResult>);
        expect(answer.ok).toBe(false);
      }
      expect(ctx.store.getSnapshot()).toBe(before);
      expect(ctx.deps.media.importImages).not.toHaveBeenCalled();
      expect(ctx.deps.media.deleteFile).not.toHaveBeenCalled();
    },
  );
});
