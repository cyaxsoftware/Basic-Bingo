/**
 * In-memory stand-in for the preload bridge, for renderer tests.
 * Uses the real shared reducer so game behavior matches the main process.
 */
import { vi } from 'vitest';
import { reduceGame, type GameCommand } from '../../shared/game/gameState';
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
    game: { calledNumbers: [], bingoBannerVisible: false },
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
    showBingoBanner: vi.fn(async () => dispatchGame({ type: 'showBingoBanner' })),
    dismissBingoBanner: vi.fn(async () => dispatchGame({ type: 'dismissBingoBanner' })),
    newGame: vi.fn(async () => dispatchGame({ type: 'newGame' })),
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
