import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcChannel, ok, type CommandResult } from '../../shared/ipc/contract';
import { createDefaultPersistedState } from '../persistence/persistedState';
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
    initialState: createDefaultPersistedState(),
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
