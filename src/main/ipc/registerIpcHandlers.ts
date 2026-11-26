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
import { slideshowCommandSchema, slideshowImages } from '../../shared/media/slideshow';
import { slideshowPlaybackCommandSchema } from '../../shared/media/slideshowPlayback';
import { isValidPatternId } from '../../shared/patterns';
import { isPresentationMode } from '../../shared/presentation/presentationMode';
import { isControllerTheme } from '../../shared/theme/controllerTheme';
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
  readonly powerPoint: { importDeck(collectionId: string): Promise<CommandResult> };
  readonly presentation: PresentationService;
  readonly displays: DisplayService;
  /** Opens the app's data folder in Windows Explorer. */
  readonly dataFolder: { show(): Promise<CommandResult> };
  readonly senders: SenderPolicy;
}

const MAX_NOTICE_ID_LENGTH = 100;

/** How long removed slide images wait for the save that drops them: 30 waits of 2 s, about a minute. */
const SAVE_WAIT_MS = 2000;
const SAVE_WAIT_ATTEMPTS = 30;

/** A command handler threw (or its promise rejected): log it, and answer with a failed result, never an IPC error. */
function failedCommand(channel: string, error: unknown): CommandResult {
  console.error(`[ipc] ${channel} failed`, error);
  return fail(error instanceof Error ? error.message : 'Unexpected error.');
}

export function registerIpcHandlers(ipc: IpcMainLike, deps: IpcDependencies): void {
  const { store, media, powerPoint, presentation, displays, dataFolder, senders } = deps;

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

  /**
   * Delete images a collection no longer uses, but only once the save that dropped them is on disk: until then the
   * last saved collection still needs the files. A slow disk is waited out (up to about a minute) instead of giving
   * up after a couple of seconds, which would leave every removed picture behind for good. If the save FAILS the
   * files are kept, because the saved state on disk still lists them.
   */
  const deleteWhenSaved = async (removed: readonly MediaItem[]): Promise<void> => {
    for (let attempt = 0; attempt < SAVE_WAIT_ATTEMPTS; attempt += 1) {
      const status = await store.settleSaves(SAVE_WAIT_MS);
      if (status === 'saved') {
        await Promise.all(removed.map((image) => media.deleteFile(image)));
        return;
      }
      if (status === 'failed') return;
    }
    console.warn(
      `[media] gave up waiting for a save; ${removed.length} removed image file(s) were left in place`,
    );
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
    return store.dispatch({ area: 'game', command: { type: 'toggleBall', ball } });
  });

  command(IpcChannel.toggleRowDisabled, (letter) =>
    isBingoLetter(letter)
      ? store.dispatch({ area: 'game', command: { type: 'toggleRowDisabled', letter } })
      : fail('Invalid row: expected B, I, N, G or O.'),
  );

  command(IpcChannel.showBingoBanner, () =>
    store.dispatch({ area: 'game', command: { type: 'showBingoBanner' } }),
  );

  command(IpcChannel.dismissBingoBanner, () =>
    store.dispatch({ area: 'game', command: { type: 'dismissBingoBanner' } }),
  );

  command(IpcChannel.newGame, () => store.dispatch({ area: 'game', command: { type: 'newGame' } }));

  command(IpcChannel.setPresentationMode, (mode) => {
    if (!isPresentationMode(mode)) return fail('Choose a valid presentation mode.');
    return store.dispatch({ area: 'presentationMode', command: { type: 'setMode', mode } });
  });

  command(IpcChannel.retrySave, (...args) => {
    if (args.length > 0) return fail('Try again takes no arguments.');
    store.retrySave();
    return ok;
  });

  command(IpcChannel.showDataFolder, (...args) =>
    args.length > 0 ? fail('Show data folder takes no arguments.') : dataFolder.show(),
  );

  command(IpcChannel.clearGameLog, (...args) => {
    if (args.length > 0) return fail('Clear history takes no arguments.');
    return store.dispatch({ area: 'gameLog', command: { type: 'clear' } });
  });

  command(IpcChannel.setControllerTheme, (theme) => {
    if (!isControllerTheme(theme)) return fail('Choose light or dark.');
    return store.dispatch({ area: 'settings', command: { type: 'setControllerTheme', theme } });
  });

  // Pattern commands. Here only the TYPES of the arguments are checked; the rules (cell 0 to 24, title 1 to 60
  // characters, unknown ids, exactly 25 cells) live in the shared reducer, which the store runs, so they apply
  // to every caller and come back as an ordinary failed result.
  command(IpcChannel.selectPattern, (patternId) =>
    isValidPatternId(patternId)
      ? store.dispatch({ area: 'patterns', command: { type: 'selectPattern', patternId } })
      : fail('Invalid pattern id.'),
  );

  command(IpcChannel.setActivePatternCell, (index, on) =>
    typeof index === 'number' && typeof on === 'boolean'
      ? store.dispatch({ area: 'patterns', command: { type: 'setActivePatternCell', index, on } })
      : fail('Choose a pattern cell and whether it is on or off.'),
  );

  command(IpcChannel.renameActivePattern, (title) =>
    typeof title === 'string'
      ? store.dispatch({ area: 'patterns', command: { type: 'renameActivePattern', title } })
      : fail('A pattern title must be text.'),
  );

  command(IpcChannel.updateSavedPattern, () =>
    store.dispatch({ area: 'patterns', command: { type: 'updateSavedPattern' } }),
  );

  command(IpcChannel.saveActivePatternAsNew, (title) => {
    if (title !== undefined && typeof title !== 'string') return fail('A pattern title must be text.');
    return store.dispatch({
      area: 'patterns',
      command:
        title === undefined ? { type: 'saveActivePatternAsNew' } : { type: 'saveActivePatternAsNew', title },
    });
  });

  command(IpcChannel.createPattern, (title, cells) =>
    typeof title === 'string' && Array.isArray(cells)
      ? store.dispatch({
          area: 'patterns',
          command: { type: 'createPattern', title, cells: cells as boolean[] },
        })
      : fail('A new pattern needs a title and its 25 cells.'),
  );

  command(IpcChannel.renamePattern, (patternId, title) =>
    isValidPatternId(patternId) && typeof title === 'string'
      ? store.dispatch({ area: 'patterns', command: { type: 'renamePattern', patternId, title } })
      : fail('Choose a saved pattern and a new title.'),
  );

  command(IpcChannel.duplicatePattern, (patternId) =>
    isValidPatternId(patternId)
      ? store.dispatch({ area: 'patterns', command: { type: 'duplicatePattern', patternId } })
      : fail('Invalid pattern id.'),
  );

  command(IpcChannel.deletePattern, (patternId) =>
    isValidPatternId(patternId)
      ? store.dispatch({ area: 'patterns', command: { type: 'deletePattern', patternId } })
      : fail('Invalid pattern id.'),
  );

  // No arguments: it pushes whatever the working pattern is right now.
  command(IpcChannel.showPatternOnProjector, () =>
    store.dispatch({ area: 'patterns', command: { type: 'showPatternOnProjector' } }),
  );
  command(IpcChannel.hidePatternOnProjector, () =>
    store.dispatch({ area: 'patterns', command: { type: 'hidePatternOnProjector' } }),
  );

  command(IpcChannel.importImages, () => media.importImages());
  const importToCollection =
    (importFiles: (collectionId: string) => Promise<CommandResult>) =>
    (...args: unknown[]) => {
      const [collectionId] = args;
      if (args.length !== 1 || !isValidMediaId(collectionId)) return fail('Choose a slideshow collection.');
      if (!store.getSnapshot().slideshow.collections.some(({ id }) => id === collectionId)) {
        return fail('That slideshow collection no longer exists.');
      }
      return importFiles(collectionId);
    };
  command(
    IpcChannel.importSlideshowImages,
    importToCollection((id) => media.importImages(id)),
  );
  command(
    IpcChannel.importPowerPoint,
    importToCollection((id) => powerPoint.importDeck(id)),
  );

  command(IpcChannel.selectSingleImage, (mediaId) =>
    mediaId === null || isValidMediaId(mediaId)
      ? store.dispatch({ area: 'media', command: { type: 'selectSingleImage', mediaId } })
      : fail('Invalid image id.'),
  );

  command(IpcChannel.setImageFit, (mediaId, fit) =>
    isValidMediaId(mediaId) && isFitMode(fit)
      ? store.dispatch({ area: 'media', command: { type: 'setImageFit', mediaId, fit } })
      : fail('Choose an image and Fit, Fill or Original.'),
  );

  command(IpcChannel.removeImage, (mediaId) => {
    if (!isValidMediaId(mediaId)) return fail('Invalid image id.');
    const item = findMedia(store.getSnapshot().mediaLibrary, mediaId);
    const result = store.dispatch({ area: 'media', command: { type: 'removeMedia', mediaId } });
    // The entry is gone; delete its file too. A file that cannot be deleted is only logged by the service.
    if (result.ok && item) void media.deleteFile(item);
    return result;
  });

  command(IpcChannel.setTimerDuration, (...args) => {
    const [durationSeconds] = args;
    return args.length === 1 && isTimerDuration(durationSeconds)
      ? store.dispatch({ area: 'timer', command: { type: 'setDuration', durationSeconds } })
      : fail('Choose a duration from 0:01 to 99:59.');
  });

  command(IpcChannel.setCountdownMessage, (...args) => {
    const [message] = args;
    return args.length === 1 && isCountdownMessage(message)
      ? store.dispatch({ area: 'timer', command: { type: 'setMessage', message } })
      : fail('Enter a countdown message between 1 and 80 characters.');
  });

  for (const [channel, type] of [
    [IpcChannel.startTimer, 'start'],
    [IpcChannel.pauseTimer, 'pause'],
    [IpcChannel.resumeTimer, 'resume'],
    [IpcChannel.resetTimer, 'reset'],
  ] as const) {
    command(channel, (...args) =>
      args.length === 0
        ? store.dispatch({ area: 'timer', command: { type } })
        : fail('This timer command takes no arguments.'),
    );
  }

  command(IpcChannel.controlSlideshow, (...args) => {
    if (args.length !== 1) return fail('Expected one playback command.');
    // Parsed here, so a renderer can never send the deadline service's internal `advance`.
    const parsed = slideshowPlaybackCommandSchema.safeParse(args[0]);
    if (!parsed.success) return fail('Invalid slideshow playback command.');
    return store.dispatch({ area: 'playback', command: parsed.data });
  });

  command(IpcChannel.editSlideshow, (...args) => {
    if (args.length !== 1) return fail('Expected one slideshow command.');
    // Parsed here, so a renderer can never send main's internal `addImages`.
    const parsed = slideshowCommandSchema.safeParse(args[0]);
    if (!parsed.success) return fail('Invalid slideshow command or settings.');
    const before = store.getSnapshot().slideshow;
    const result = store.dispatch({ area: 'slideshow', command: parsed.data });
    const after = store.getSnapshot().slideshow;
    if (before.collections === after.collections) return result;
    const remaining = new Set(slideshowImages(after).map(({ id }) => id));
    const removed = slideshowImages(before).filter(({ id }) => !remaining.has(id));
    if (removed.length > 0) void deleteWhenSaved(removed);
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
