/**
 * IPC handlers: the only entry points from renderers into the main process.
 *
 * Every handler:
 *  - checks the sender (queries: any app window; commands: Controller only)
 *  - validates its arguments (renderer input is untrusted)
 *  - returns a CommandResult instead of throwing across IPC
 *
 * Registration is idempotent per IpcMain instance: existing handlers for our
 * channels are removed first, so a hot restart or accidental second call
 * cannot throw "Attempted to register a second handler".
 */
import { isValidBall } from '../../shared/game/balls';
import {
  fail,
  IpcChannel,
  ok,
  type AppSnapshot,
  type CommandResult,
  type DisplayInfo,
} from '../../shared/ipc/contract';
import type { AppStore } from '../state/appStore';

/** The subset of Electron's IpcMain we use; lets tests pass a fake. */
export interface IpcMainLike {
  handle(channel: string, listener: (event: IpcEventLike, ...args: unknown[]) => unknown): void;
  removeHandler(channel: string): void;
}

/** The subset of IpcMainInvokeEvent we use. */
export interface IpcEventLike {
  readonly sender: { readonly id: number };
}

export interface SenderPolicy {
  /** The Controller window may send commands. */
  isController(webContentsId: number): boolean;
  /** Any window created by this app may query state. */
  isAppWindow(webContentsId: number): boolean;
}

export interface PresentationService {
  openOnDisplay(displayId: number): CommandResult;
  openPreview(): CommandResult;
  close(): CommandResult;
}

export interface DisplayService {
  /** Re-read displays from the OS, publish them, and return them. */
  refresh(): readonly DisplayInfo[];
}

export interface IpcDependencies {
  readonly store: AppStore;
  readonly presentation: PresentationService;
  readonly displays: DisplayService;
  readonly senders: SenderPolicy;
}

const MAX_NOTICE_ID_LENGTH = 100;

export function registerIpcHandlers(ipc: IpcMainLike, deps: IpcDependencies): void {
  const { store, presentation, displays, senders } = deps;

  const query = <T>(channel: string, handler: () => T) => {
    ipc.removeHandler(channel);
    ipc.handle(channel, (event) => {
      if (!senders.isAppWindow(event.sender.id)) {
        throw new Error(`Rejected ${channel} from an unknown sender.`);
      }
      return handler();
    });
  };

  const command = (channel: string, handler: (...args: unknown[]) => CommandResult) => {
    ipc.removeHandler(channel);
    ipc.handle(channel, (event, ...args): CommandResult => {
      if (!senders.isController(event.sender.id)) {
        return fail('Only the Controller window can change the game.');
      }
      try {
        return handler(...args);
      } catch (error) {
        console.error(`[ipc] ${channel} failed`, error);
        return fail(error instanceof Error ? error.message : 'Unexpected error.');
      }
    });
  };

  query<AppSnapshot>(IpcChannel.getSnapshot, () => store.getSnapshot());

  // listDisplays is a Controller-only query that also refreshes state.
  ipc.removeHandler(IpcChannel.listDisplays);
  ipc.handle(IpcChannel.listDisplays, (event) => {
    if (!senders.isController(event.sender.id)) {
      throw new Error(`Rejected ${IpcChannel.listDisplays} from a non-Controller sender.`);
    }
    return displays.refresh();
  });

  command(IpcChannel.toggleBall, (ball) => {
    if (!isValidBall(ball)) return fail(`Invalid ball ${String(ball)}: expected an integer from 1 to 75.`);
    return store.dispatch({ type: 'toggleBall', ball });
  });

  command(IpcChannel.openPresentation, (displayId) => {
    if (typeof displayId !== 'number' || !Number.isSafeInteger(displayId)) {
      return fail('Choose a display to project to.');
    }
    return presentation.openOnDisplay(displayId);
  });

  command(IpcChannel.openPreview, () => presentation.openPreview());

  command(IpcChannel.closePresentation, () => presentation.close());

  command(IpcChannel.dismissNotice, (noticeId) => {
    if (typeof noticeId !== 'string' || noticeId.length === 0 || noticeId.length > MAX_NOTICE_ID_LENGTH) {
      return fail('Invalid notice id.');
    }
    store.dismissNotice(noticeId);
    return ok;
  });
}
