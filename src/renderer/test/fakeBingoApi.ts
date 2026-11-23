/**
 * In-memory stand-in for the preload bridge, for renderer tests.
 * Uses the real shared reducer so game behavior matches the main process.
 */
import { vi } from 'vitest';
import type { BingoLetter } from '../../shared/game/balls';
import { reduceGame, type GameCommand } from '../../shared/game/gameState';
import { reduceMedia, type FitMode, type MediaCommand } from '../../shared/media';
import {
  blankActivePattern,
  createDefaultLibrary,
  reducePatterns,
  type PatternCells,
  type PatternCommand,
} from '../../shared/patterns';
import { isPresentationMode, type PresentationMode } from '../../shared/presentation/presentationMode';
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
    revision: 1,
    game: { calledNumbers: [], bingoBannerVisible: false, disabledRows: [] },
    presentationMode: 'gameBoard',
    patternLibrary: createDefaultLibrary(),
    activePattern: blankActivePattern(),
    shownPattern: null,
    mediaLibrary: [],
    singleImage: { imageId: null },
    presentation: { kind: 'closed' },
    displays: [LAPTOP, PROJECTOR],
    preferredDisplayId: null,
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

  const dispatchGame = (command: GameCommand): CommandResult => {
    try {
      const game = reduceGame(snapshot.game, command);
      // Like the real store: a no-op command publishes nothing.
      if (game !== snapshot.game) publish({ game });
      return ok;
    } catch (error) {
      return fail((error as Error).message);
    }
  };

  const dispatchMedia = (command: MediaCommand): CommandResult => {
    try {
      const current = { library: snapshot.mediaLibrary, singleImage: snapshot.singleImage };
      const next = reduceMedia(current, command);
      if (next !== current) publish({ mediaLibrary: next.library, singleImage: next.singleImage });
      return ok;
    } catch (error) {
      return fail((error as Error).message);
    }
  };

  // Same shared rules as the real store; ids and time are predictable.
  let patternIds = 0;
  const dispatchPattern = (command: PatternCommand): CommandResult => {
    try {
      const current = {
        library: snapshot.patternLibrary,
        active: snapshot.activePattern,
        shown: snapshot.shownPattern,
      };
      const next = reducePatterns(current, command, {
        now: '2026-01-02T00:00:00.000Z',
        newId: () => `fake-pattern-${(patternIds += 1)}`,
      });
      if (next !== current) {
        publish({ patternLibrary: next.library, activePattern: next.active, shownPattern: next.shown });
      }
      return ok;
    } catch (error) {
      return fail((error as Error).message);
    }
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
    toggleBall: vi.fn(async (ball: number) => dispatchGame({ type: 'toggleBall', ball })),
    toggleRowDisabled: vi.fn(async (letter: BingoLetter) =>
      dispatchGame({ type: 'toggleRowDisabled', letter }),
    ),
    showBingoBanner: vi.fn(async () => dispatchGame({ type: 'showBingoBanner' })),
    dismissBingoBanner: vi.fn(async () => dispatchGame({ type: 'dismissBingoBanner' })),
    newGame: vi.fn(async () => dispatchGame({ type: 'newGame' })),
    setPresentationMode: vi.fn(async (mode: PresentationMode) => {
      if (!isPresentationMode(mode)) return fail('Choose a valid presentation mode.');
      if (mode !== snapshot.presentationMode) publish({ presentationMode: mode });
      return ok;
    }),
    selectPattern: vi.fn(async (patternId: string) => dispatchPattern({ type: 'selectPattern', patternId })),
    setActivePatternCell: vi.fn(async (index: number, on: boolean) =>
      dispatchPattern({ type: 'setActivePatternCell', index, on }),
    ),
    renameActivePattern: vi.fn(async (title: string) =>
      dispatchPattern({ type: 'renameActivePattern', title }),
    ),
    updateSavedPattern: vi.fn(async () => dispatchPattern({ type: 'updateSavedPattern' })),
    saveActivePatternAsNew: vi.fn(async (title?: string) =>
      dispatchPattern(
        title === undefined ? { type: 'saveActivePatternAsNew' } : { type: 'saveActivePatternAsNew', title },
      ),
    ),
    createPattern: vi.fn(async (title: string, cells: PatternCells) =>
      dispatchPattern({ type: 'createPattern', title, cells }),
    ),
    renamePattern: vi.fn(async (patternId: string, title: string) =>
      dispatchPattern({ type: 'renamePattern', patternId, title }),
    ),
    duplicatePattern: vi.fn(async (patternId: string) =>
      dispatchPattern({ type: 'duplicatePattern', patternId }),
    ),
    deletePattern: vi.fn(async (patternId: string) => dispatchPattern({ type: 'deletePattern', patternId })),
    showPatternOnProjector: vi.fn(async () => dispatchPattern({ type: 'showPatternOnProjector' })),
    hidePatternOnProjector: vi.fn(async () => dispatchPattern({ type: 'hidePatternOnProjector' })),
    // Importing needs the file dialog, which tests do not have: they put images in with api.push(makeSnapshot({...})).
    importImages: vi.fn(async () => ok),
    selectSingleImage: vi.fn(async (mediaId: string | null) =>
      dispatchMedia({ type: 'selectSingleImage', mediaId }),
    ),
    setImageFit: vi.fn(async (mediaId: string, fit: FitMode) =>
      dispatchMedia({ type: 'setImageFit', mediaId, fit }),
    ),
    removeImage: vi.fn(async (mediaId: string) => dispatchMedia({ type: 'removeMedia', mediaId })),
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
