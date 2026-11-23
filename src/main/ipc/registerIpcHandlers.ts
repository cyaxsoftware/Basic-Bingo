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
import { isBingoLetter, isValidBall } from '../../shared/game/balls';
import { findMedia, isFitMode, isValidMediaId, type MediaItem } from '../../shared/media';
import { slideshowImages } from '../../shared/media/slideshow';
import { isValidPatternId } from '../../shared/patterns';
import { isPresentationMode } from '../../shared/presentation/presentationMode';
import { isCountdownMessage, isTimerDuration } from '../../shared/timer/timerState';
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

/** Importing and deleting image files, which the main process does (renderers never touch the disk). */
export interface MediaService {
  /** Ask the operator to choose images, copy them into the library, and say how it went. */
  importImages(collectionId?: string): Promise<CommandResult>;
  /** Delete a removed image's stored file. Best effort: the library entry is already gone. */
  deleteFile(item: MediaItem): Promise<void>;
}

export interface IpcDependencies {
  readonly store: AppStore;
  readonly media: MediaService;
  readonly presentation: PresentationService;
  readonly displays: DisplayService;
  readonly senders: SenderPolicy;
}

const MAX_NOTICE_ID_LENGTH = 100;

/** A command handler threw (or its promise rejected): log it, and answer with a failed result, never an IPC error. */
function failedCommand(channel: string, error: unknown): CommandResult {
  console.error(`[ipc] ${channel} failed`, error);
  return fail(error instanceof Error ? error.message : 'Unexpected error.');
}

export function registerIpcHandlers(ipc: IpcMainLike, deps: IpcDependencies): void {
  const { store, media, presentation, displays, senders } = deps;

  const query = <T>(channel: string, handler: () => T) => {
    ipc.removeHandler(channel);
    ipc.handle(channel, (event) => {
      if (!senders.isAppWindow(event.sender.id)) {
        throw new Error(`Rejected ${channel} from an unknown sender.`);
      }
      return handler();
    });
  };

  // Most commands answer at once. One that has to wait (importing images opens a file dialog) may return a
  // promise; a synchronous handler still answers synchronously.
  const command = (
    channel: string,
    handler: (...args: unknown[]) => CommandResult | Promise<CommandResult>,
  ) => {
    ipc.removeHandler(channel);
    ipc.handle(channel, (event, ...args): CommandResult | Promise<CommandResult> => {
      if (!senders.isController(event.sender.id)) {
        return fail('Only the Controller window can change the game.');
      }
      try {
        const result = handler(...args);
        return result instanceof Promise ? result.catch((error) => failedCommand(channel, error)) : result;
      } catch (error) {
        return failedCommand(channel, error);
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

  command(IpcChannel.toggleRowDisabled, (letter) =>
    isBingoLetter(letter)
      ? store.dispatch({ type: 'toggleRowDisabled', letter })
      : fail('Invalid row: expected B, I, N, G or O.'),
  );

  command(IpcChannel.showBingoBanner, () => store.dispatch({ type: 'showBingoBanner' }));

  command(IpcChannel.dismissBingoBanner, () => store.dispatch({ type: 'dismissBingoBanner' }));

  command(IpcChannel.newGame, () => store.dispatch({ type: 'newGame' }));

  command(IpcChannel.setPresentationMode, (mode) => {
    if (!isPresentationMode(mode)) return fail('Choose a valid presentation mode.');
    return store.setPresentationMode(mode);
  });

  // Pattern commands. Here only the TYPES of the arguments are checked; the rules (cell 0 to 24, title 1 to 60
  // characters, unknown ids, exactly 25 cells) live in the shared reducer, which the store runs, so they apply
  // to every caller and come back as an ordinary failed result.
  command(IpcChannel.selectPattern, (patternId) =>
    isValidPatternId(patternId)
      ? store.dispatchPattern({ type: 'selectPattern', patternId })
      : fail('Invalid pattern id.'),
  );

  command(IpcChannel.setActivePatternCell, (index, on) =>
    typeof index === 'number' && typeof on === 'boolean'
      ? store.dispatchPattern({ type: 'setActivePatternCell', index, on })
      : fail('Choose a pattern cell and whether it is on or off.'),
  );

  command(IpcChannel.renameActivePattern, (title) =>
    typeof title === 'string'
      ? store.dispatchPattern({ type: 'renameActivePattern', title })
      : fail('A pattern title must be text.'),
  );

  command(IpcChannel.updateSavedPattern, () => store.dispatchPattern({ type: 'updateSavedPattern' }));

  command(IpcChannel.saveActivePatternAsNew, (title) => {
    if (title !== undefined && typeof title !== 'string') return fail('A pattern title must be text.');
    return store.dispatchPattern(
      title === undefined ? { type: 'saveActivePatternAsNew' } : { type: 'saveActivePatternAsNew', title },
    );
  });

  command(IpcChannel.createPattern, (title, cells) =>
    typeof title === 'string' && Array.isArray(cells)
      ? store.dispatchPattern({ type: 'createPattern', title, cells: cells as boolean[] })
      : fail('A new pattern needs a title and its 25 cells.'),
  );

  command(IpcChannel.renamePattern, (patternId, title) =>
    isValidPatternId(patternId) && typeof title === 'string'
      ? store.dispatchPattern({ type: 'renamePattern', patternId, title })
      : fail('Choose a saved pattern and a new title.'),
  );

  command(IpcChannel.duplicatePattern, (patternId) =>
    isValidPatternId(patternId)
      ? store.dispatchPattern({ type: 'duplicatePattern', patternId })
      : fail('Invalid pattern id.'),
  );

  command(IpcChannel.deletePattern, (patternId) =>
    isValidPatternId(patternId)
      ? store.dispatchPattern({ type: 'deletePattern', patternId })
      : fail('Invalid pattern id.'),
  );

  // No arguments: it pushes whatever the working pattern is right now.
  command(IpcChannel.showPatternOnProjector, () => store.dispatchPattern({ type: 'showPatternOnProjector' }));
  command(IpcChannel.hidePatternOnProjector, () => store.dispatchPattern({ type: 'hidePatternOnProjector' }));

  command(IpcChannel.importImages, () => media.importImages());
  command(IpcChannel.importSlideshowImages, (...args) => {
    const [collectionId] = args;
    if (args.length !== 1 || !isValidMediaId(collectionId)) return fail('Choose a slideshow collection.');
    if (!store.getSnapshot().slideshow.collections.some(({ id }) => id === collectionId)) {
      return fail('That slideshow collection no longer exists.');
    }
    return media.importImages(collectionId);
  });

  command(IpcChannel.selectSingleImage, (mediaId) =>
    mediaId === null || isValidMediaId(mediaId)
      ? store.dispatchMedia({ type: 'selectSingleImage', mediaId })
      : fail('Invalid image id.'),
  );

  command(IpcChannel.setImageFit, (mediaId, fit) =>
    isValidMediaId(mediaId) && isFitMode(fit)
      ? store.dispatchMedia({ type: 'setImageFit', mediaId, fit })
      : fail('Choose an image and Fit, Fill or Original.'),
  );

  command(IpcChannel.removeImage, (mediaId) => {
    if (!isValidMediaId(mediaId)) return fail('Invalid image id.');
    const item = findMedia(store.getSnapshot().mediaLibrary, mediaId);
    const result = store.dispatchMedia({ type: 'removeMedia', mediaId });
    // The entry is gone; delete its file too. A file that cannot be deleted is only logged by the service.
    if (result.ok && item) void media.deleteFile(item);
    return result;
  });

  command(IpcChannel.setTimerDuration, (...args) => {
    const [durationSeconds] = args;
    return args.length === 1 && isTimerDuration(durationSeconds)
      ? store.dispatchTimer({ type: 'setDuration', durationSeconds })
      : fail('Choose a duration from 0:01 to 99:59.');
  });

  command(IpcChannel.setCountdownMessage, (...args) => {
    const [message] = args;
    return args.length === 1 && isCountdownMessage(message)
      ? store.dispatchTimer({ type: 'setMessage', message })
      : fail('Enter a countdown message between 1 and 80 characters.');
  });

  for (const [channel, type] of [
    [IpcChannel.startTimer, 'start'],
    [IpcChannel.pauseTimer, 'pause'],
    [IpcChannel.resumeTimer, 'resume'],
    [IpcChannel.resetTimer, 'reset'],
  ] as const) {
    command(channel, (...args) =>
      args.length === 0 ? store.dispatchTimer({ type }) : fail('This timer command takes no arguments.'),
    );
  }

  command(IpcChannel.editSlideshow, (...args) => {
    if (args.length !== 1) return fail('Expected one slideshow command.');
    const before = store.getSnapshot().slideshow;
    const result = store.dispatchSlideshow(args[0]);
    const after = store.getSnapshot().slideshow;
    if (before === after) return result;
    const remaining = new Set(slideshowImages(after).map(({ id }) => id));
    const removed = slideshowImages(before).filter(({ id }) => !remaining.has(id));
    if (removed.length > 0) {
      // If the save fails, the last on-disk collection still needs its images.
      void store.settleSaves(2000).then(async (status) => {
        if (status === 'saved') await Promise.all(removed.map((image) => media.deleteFile(image)));
      });
    }
    return result;
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
