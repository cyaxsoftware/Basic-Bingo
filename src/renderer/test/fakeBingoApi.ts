/**
 * In-memory stand-in for the preload bridge, for renderer tests.
 *
 * Every change to the app state goes through the same reduceAppState the main-process store runs, so the rules
 * renderer tests see (the games-played log, slides dropped with their image, playback stopping on a mode change)
 * are the real ones. Only the window state (presentation window, displays, notices) is simulated here.
 */
import { vi } from 'vitest';
import { createInitialAppState, reduceAppState, type AppCommand } from '../../shared/app/appState';
import type { BingoLetter } from '../../shared/game/balls';
import type { FitMode } from '../../shared/media';
import type { PatternCells } from '../../shared/patterns';
import { isPresentationMode, type PresentationMode } from '../../shared/presentation/presentationMode';
import { isControllerTheme, type ControllerTheme } from '../../shared/theme/controllerTheme';
import type { SlideshowCommand } from '../../shared/media/slideshow';
import type { SlideshowPlaybackCommand } from '../../shared/media/slideshowPlayback';
import {
  fail,
  ok,
  type AppSnapshot,
  type CommandResult,
  type ControllerApi,
  type DisplayInfo,
} from '../../shared/ipc/contract';

export const LAPTOP: DisplayInfo = {
  id: 1,
  label: 'Built-in Display — 1920×1080 (primary, Controller)',
  isPrimary: true,
  isInternal: true,
  hostsController: true,
  bounds: { x: 0, y: 0, width: 1536, height: 864 },
  scaleFactor: 1.25,
};

export const PROJECTOR: DisplayInfo = {
  id: 2,
  label: 'Display 2 — 1920×1080',
  isPrimary: false,
  isInternal: false,
  hostsController: false,
  bounds: { x: 1536, y: 0, width: 1920, height: 1080 },
  scaleFactor: 1,
};

export function makeSnapshot(overrides: Partial<AppSnapshot> = {}): AppSnapshot {
  return {
    ...createInitialAppState(),
    revision: 1,
    presentation: { kind: 'closed' },
    displays: [LAPTOP, PROJECTOR],
    persistence: { kind: 'ok' },
    notices: [],
    ...overrides,
  };
}

export interface FakeBingoApi extends ControllerApi {
  /** Push a snapshot to subscribers as main would. */
  push(snapshot: AppSnapshot): void;
  current(): AppSnapshot;
}

export function createFakeBingoApi(initial: AppSnapshot = makeSnapshot()): FakeBingoApi {
  let snapshot = initial;
  const listeners = new Set<(s: AppSnapshot) => void>();
  const publish = (changes: Partial<AppSnapshot>) => {
    snapshot = { ...snapshot, ...changes, revision: snapshot.revision + 1 };
    listeners.forEach((l) => l(snapshot));
  };

  // Predictable ids (valid UUIDs, which slideshow collections need); the real clock, like the store.
  let ids = 0;
  const newId = () => `00000000-0000-4000-8000-${String(++ids).padStart(12, '0')}`;
  const dispatch = (command: AppCommand): CommandResult => {
    const result = reduceAppState(snapshot, command, { now: new Date(), newId });
    if (!result.ok) return fail(result.error);
    // Like the real store: a command that changes nothing publishes nothing.
    if (result.state !== snapshot) publish(result.state);
    return ok;
  };

  return {
    push(next) {
      snapshot = next;
      listeners.forEach((l) => l(next));
    },
    current: () => snapshot,
    getSnapshot: vi.fn(async () => snapshot),
    onSnapshot: vi.fn((listener: (s: AppSnapshot) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }),
    toggleBall: vi.fn(async (ball: number) =>
      dispatch({ area: 'game', command: { type: 'toggleBall', ball } }),
    ),
    toggleRowDisabled: vi.fn(async (letter: BingoLetter) =>
      dispatch({ area: 'game', command: { type: 'toggleRowDisabled', letter } }),
    ),
    showBingoBanner: vi.fn(async () => dispatch({ area: 'game', command: { type: 'showBingoBanner' } })),
    dismissBingoBanner: vi.fn(async () =>
      dispatch({ area: 'game', command: { type: 'dismissBingoBanner' } }),
    ),
    newGame: vi.fn(async () => dispatch({ area: 'game', command: { type: 'newGame' } })),
    // The IPC handlers' argument checks, which tests can reach by passing a bad value.
    setPresentationMode: vi.fn(async (mode: PresentationMode) =>
      isPresentationMode(mode)
        ? dispatch({ area: 'presentationMode', command: { type: 'setMode', mode } })
        : fail('Choose a valid presentation mode.'),
    ),
    setControllerTheme: vi.fn(async (theme: ControllerTheme) =>
      isControllerTheme(theme)
        ? dispatch({ area: 'settings', command: { type: 'setControllerTheme', theme } })
        : fail('Choose light or dark.'),
    ),
    retrySave: vi.fn(async () => ok),
    showDataFolder: vi.fn(async () => ok),
    clearGameLog: vi.fn(async () => dispatch({ area: 'gameLog', command: { type: 'clear' } })),
    selectPattern: vi.fn(async (patternId: string) =>
      dispatch({ area: 'patterns', command: { type: 'selectPattern', patternId } }),
    ),
    setActivePatternCell: vi.fn(async (index: number, on: boolean) =>
      dispatch({ area: 'patterns', command: { type: 'setActivePatternCell', index, on } }),
    ),
    renameActivePattern: vi.fn(async (title: string) =>
      dispatch({ area: 'patterns', command: { type: 'renameActivePattern', title } }),
    ),
    updateSavedPattern: vi.fn(async () =>
      dispatch({ area: 'patterns', command: { type: 'updateSavedPattern' } }),
    ),
    saveActivePatternAsNew: vi.fn(async (title?: string) =>
      dispatch({
        area: 'patterns',
        command:
          title === undefined
            ? { type: 'saveActivePatternAsNew' }
            : { type: 'saveActivePatternAsNew', title },
      }),
    ),
    createPattern: vi.fn(async (title: string, cells: PatternCells) =>
      dispatch({ area: 'patterns', command: { type: 'createPattern', title, cells } }),
    ),
    renamePattern: vi.fn(async (patternId: string, title: string) =>
      dispatch({ area: 'patterns', command: { type: 'renamePattern', patternId, title } }),
    ),
    duplicatePattern: vi.fn(async (patternId: string) =>
      dispatch({ area: 'patterns', command: { type: 'duplicatePattern', patternId } }),
    ),
    deletePattern: vi.fn(async (patternId: string) =>
      dispatch({ area: 'patterns', command: { type: 'deletePattern', patternId } }),
    ),
    showPatternOnProjector: vi.fn(async () =>
      dispatch({ area: 'patterns', command: { type: 'showPatternOnProjector' } }),
    ),
    hidePatternOnProjector: vi.fn(async () =>
      dispatch({ area: 'patterns', command: { type: 'hidePatternOnProjector' } }),
    ),
    // Importing needs the file dialog, which tests do not have: they put images in with api.push(makeSnapshot({...})).
    importImages: vi.fn(async () => ok),
    importPowerPoint: vi.fn(async (_collectionId: string) => ok),
    importSlideshowImages: vi.fn(async (_collectionId: string) => ok),
    selectSingleImage: vi.fn(async (mediaId: string | null) =>
      dispatch({ area: 'media', command: { type: 'selectSingleImage', mediaId } }),
    ),
    setImageFit: vi.fn(async (mediaId: string, fit: FitMode) =>
      dispatch({ area: 'media', command: { type: 'setImageFit', mediaId, fit } }),
    ),
    removeImage: vi.fn(async (mediaId: string) =>
      dispatch({ area: 'media', command: { type: 'removeMedia', mediaId } }),
    ),
    setTimerDuration: vi.fn(async (durationSeconds: number) =>
      dispatch({ area: 'timer', command: { type: 'setDuration', durationSeconds } }),
    ),
    setCountdownMessage: vi.fn(async (message: string) =>
      dispatch({ area: 'timer', command: { type: 'setMessage', message } }),
    ),
    startTimer: vi.fn(async () => dispatch({ area: 'timer', command: { type: 'start' } })),
    pauseTimer: vi.fn(async () => dispatch({ area: 'timer', command: { type: 'pause' } })),
    resumeTimer: vi.fn(async () => dispatch({ area: 'timer', command: { type: 'resume' } })),
    resetTimer: vi.fn(async () => dispatch({ area: 'timer', command: { type: 'reset' } })),
    editSlideshow: vi.fn(async (command: SlideshowCommand) => dispatch({ area: 'slideshow', command })),
    controlSlideshow: vi.fn(async (command: SlideshowPlaybackCommand) =>
      dispatch({ area: 'playback', command }),
    ),
    listDisplays: vi.fn(async () => snapshot.displays),
    openPresentation: vi.fn(async (displayId: number) => {
      const display = snapshot.displays.find((d) => d.id === displayId);
      if (!display) return fail('That display is no longer connected.');
      publish({ presentation: { kind: 'projecting', displayId, displayLabel: display.label } });
      return ok;
    }),
    openPreview: vi.fn(async () => {
      publish({ presentation: { kind: 'preview' } });
      return ok;
    }),
    closePresentation: vi.fn(async () => {
      publish({ presentation: { kind: 'closed' } });
      return ok;
    }),
    dismissNotice: vi.fn(async (id: string) => {
      publish({ notices: snapshot.notices.filter((n) => n.id !== id) });
      return ok;
    }),
  };
}
