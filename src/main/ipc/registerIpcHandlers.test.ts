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
      expect(ctx.store.getSnapshot().game).toEqual({ calledNumbers: [3, 9], bingoBannerVisible: true });

      expect(ctx.ipc.invoke(CONTROLLER_ID, IpcChannel.dismissBingoBanner)).toEqual({ ok: true });
      expect(ctx.store.getSnapshot().game).toEqual({ calledNumbers: [3, 9], bingoBannerVisible: false });

      ctx.ipc.invoke(CONTROLLER_ID, IpcChannel.showBingoBanner);
      expect(ctx.ipc.invoke(CONTROLLER_ID, IpcChannel.newGame)).toEqual({ ok: true });
      expect(ctx.store.getSnapshot().game).toEqual({ calledNumbers: [], bingoBannerVisible: false });
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
