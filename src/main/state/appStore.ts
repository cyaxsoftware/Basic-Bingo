/**
 * The authoritative application state, owned by the main process.
 *
 * Responsibilities:
 *  - apply game commands through the shared reducer (one at a time; Node's
 *    event loop serializes IPC calls, so no locking is needed)
 *  - track runtime-only state (presentation window, displays, notices)
 *  - persist the durable subset after each accepted change, without blocking
 *  - publish an immutable snapshot with a strictly increasing revision
 *
 * Nothing here imports Electron, so it is fully unit-testable.
 */
import { randomUUID } from 'node:crypto';
import { reduceGame, type GameCommand, type GameState } from '../../shared/game/gameState';
import {
  fail,
  ok,
  type AppSnapshot,
  type CommandResult,
  type DisplayInfo,
  type Notice,
  type PersistenceStatus,
  type PresentationStatus,
} from '../../shared/ipc/contract';
import type { PresentationMode } from '../../shared/presentation/presentationMode';
import type { ControllerTheme } from '../../shared/theme/controllerTheme';
import { applyGameChange, clearGameRecords } from '../../shared/games/gameLog';
import { toPersistedState, type AppData } from '../persistence/persistedState';
import { reduceMedia, type MediaCommand, type MediaItem } from '../../shared/media';
import {
  appendSlideshowImages,
  reduceSlideshow,
  removeImageFromSlideshows,
  type SlideshowState,
} from '../../shared/media/slideshow';
import { reducePatterns, type PatternCommand } from '../../shared/patterns';
import {
  activeSlideshow,
  advanceSlideshow,
  reconcileSlideshowPlayback,
  reduceSlideshowPlayback,
  stopSlideshow,
  STOPPED_SLIDESHOW,
} from '../../shared/media/slideshowPlayback';
import { reduceTimer, type TimerCommand, type TimerState } from '../../shared/timer/timerState';
import type { StatePersister } from '../persistence/stateRepository';

export type SnapshotListener = (snapshot: AppSnapshot) => void;

/** Whether the latest durable state has reached disk. */
export type SaveStatus = 'saved' | 'failed' | 'pending';

/** How waiting for the latest save ended. */
export type SaveOutcome = 'saved' | 'failed' | 'timeout';

export interface AppStoreOptions {
  /** Durable state loaded at startup (see fromPersistedState). */
  readonly initialData: AppData;
  readonly persister: StatePersister;
  readonly initialNotices?: readonly Notice[];
  readonly now?: () => Date;
  /** Ids for new patterns. Defaults to random UUIDs; tests pass something predictable. */
  readonly newId?: () => string;
}

type MutableFields = Omit<AppSnapshot, 'revision'>;

export class AppStore {
  private snapshot: AppSnapshot;
  private readonly listeners = new Set<SnapshotListener>();
  private readonly persister: StatePersister;
  private readonly now: () => Date;
  private readonly newId: () => string;
  private requestedSaveId = 0;
  private completedSaveId = 0;
  private failedSaveId = 0;
  private readonly saveWaiters = new Set<() => void>();

  constructor(options: AppStoreOptions) {
    this.persister = options.persister;
    this.now = options.now ?? (() => new Date());
    this.newId = options.newId ?? (() => randomUUID());
    this.snapshot = Object.freeze<AppSnapshot>({
      revision: 1,
      game: options.initialData.game,
      presentationMode: options.initialData.presentation.mode,
      patternLibrary: options.initialData.patterns.library,
      activePattern: options.initialData.patterns.active,
      shownPattern: options.initialData.patterns.shown,
      mediaLibrary: options.initialData.media.library,
      singleImage: options.initialData.media.singleImage,
      timer: options.initialData.timer,
      slideshow: options.initialData.slideshow,
      slideshowPlayback: STOPPED_SLIDESHOW,
      gameLog: options.initialData.gameLog,
      presentation: { kind: 'closed' },
      displays: [],
      preferredDisplayId: options.initialData.settings.preferredDisplayId,
      controllerTheme: options.initialData.settings.controllerTheme,
      persistence: { kind: 'ok' },
      notices: options.initialNotices ?? [],
    });
  }

  getSnapshot(): AppSnapshot {
    return this.snapshot;
  }

  /** Listener is called synchronously after every change. Returns an unsubscribe function. */
  subscribe(listener: SnapshotListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Validate and apply a game command. Invalid commands leave state untouched. */
  dispatch(command: GameCommand): CommandResult {
    let next: GameState;
    try {
      next = reduceGame(this.snapshot.game, command);
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error));
    }
    if (next !== this.snapshot.game) {
      // The log sees the same change at the same moment, so the first ball, the last BINGO CALLED press and
      // New Game are timed exactly when they happen. The game rules themselves never see a clock.
      const gameLog = applyGameChange(this.snapshot.gameLog, {
        command,
        before: this.snapshot.game,
        after: next,
        now: this.now().getTime(),
        patternTitle: this.snapshot.activePattern.title,
        newId: this.newId,
      });
      this.update({ game: next, gameLog });
      this.persist();
    }
    return ok;
  }

  /** Empty the games-played history. The game in progress keeps its timing. */
  clearGameLog(): void {
    const gameLog = clearGameRecords(this.snapshot.gameLog);
    if (gameLog === this.snapshot.gameLog) return;
    this.update({ gameLog });
    this.persist();
  }

  /**
   * Validate and apply a pattern command (select, edit the working copy, save, library changes). Invalid
   * commands leave state untouched. Touches no game state, so New Game and mode changes never affect patterns.
   */
  dispatchPattern(command: PatternCommand): CommandResult {
    const current = {
      library: this.snapshot.patternLibrary,
      active: this.snapshot.activePattern,
      shown: this.snapshot.shownPattern,
    };
    let next;
    try {
      next = reducePatterns(current, command, { now: this.now().toISOString(), newId: this.newId });
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error));
    }
    if (next !== current) {
      this.update({ patternLibrary: next.library, activePattern: next.active, shownPattern: next.shown });
      this.persist();
    }
    return ok;
  }

  /**
   * Validate and apply a media command (choose the Single Image, Fit / Fill, remove an image, or add what main has
   * just imported). Invalid commands leave state untouched. Touches no game or pattern state.
   */
  dispatchMedia(command: MediaCommand): CommandResult {
    const current = { library: this.snapshot.mediaLibrary, singleImage: this.snapshot.singleImage };
    let next;
    try {
      next = reduceMedia(current, command);
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error));
    }
    if (next !== current) {
      const slideshow =
        command.type === 'removeMedia'
          ? removeImageFromSlideshows(this.snapshot.slideshow, command.mediaId)
          : this.snapshot.slideshow;
      this.update({
        mediaLibrary: next.library,
        singleImage: next.singleImage,
        slideshow,
        slideshowPlayback: this.reconcileSlideshow(slideshow),
      });
      this.persist();
    }
    return ok;
  }

  dispatchSlideshow(command: unknown): CommandResult {
    return this.changeSlideshow((state) => reduceSlideshow(state, command, this.newId));
  }

  addSlideshowImages(collectionId: string, images: readonly MediaItem[]): CommandResult {
    return this.changeSlideshow((state) =>
      appendSlideshowImages(state, collectionId, images, this.snapshot.mediaLibrary),
    );
  }

  private changeSlideshow(reduce: (state: SlideshowState) => SlideshowState): CommandResult {
    let slideshow: SlideshowState;
    try {
      slideshow = reduce(this.snapshot.slideshow);
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error));
    }
    if (slideshow !== this.snapshot.slideshow) {
      this.update({ slideshow, slideshowPlayback: this.reconcileSlideshow(slideshow) });
      this.persist();
    }
    return ok;
  }

  private reconcileSlideshow(slideshow: SlideshowState) {
    if (slideshow === this.snapshot.slideshow) return this.snapshot.slideshowPlayback;
    return reconcileSlideshowPlayback(
      this.snapshot.slideshowPlayback,
      this.snapshot.slideshow,
      slideshow,
      this.now().getTime(),
    );
  }

  dispatchSlideshowPlayback(command: unknown): CommandResult {
    if (this.snapshot.presentationMode !== 'slideshow') return fail('Open Slideshow to control playback.');
    const { slideshow, slideshowPlayback } = this.snapshot;
    try {
      const next = reduceSlideshowPlayback(
        slideshowPlayback,
        activeSlideshow(slideshow),
        command,
        this.now().getTime(),
      );
      if (next !== slideshowPlayback) this.update({ slideshowPlayback: next });
      return ok;
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error));
    }
  }

  advanceSlideshow(deadline: number): void {
    const { slideshow, slideshowPlayback } = this.snapshot;
    const next = advanceSlideshow(
      slideshowPlayback,
      activeSlideshow(slideshow),
      deadline,
      this.now().getTime(),
    );
    if (next !== slideshowPlayback) this.update({ slideshowPlayback: next });
  }

  dispatchTimer(command: TimerCommand): CommandResult {
    let timer: TimerState;
    try {
      timer = reduceTimer(this.snapshot.timer, command, this.now().getTime());
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error));
    }
    if (timer !== this.snapshot.timer) {
      this.update({ timer });
      this.persist();
    }
    return ok;
  }

  /** Switch what the audience display shows. Touches no game state. */
  setPresentationMode(mode: PresentationMode): CommandResult {
    if (mode !== this.snapshot.presentationMode) {
      const { slideshowPlayback } = this.snapshot;
      this.update({
        presentationMode: mode,
        slideshowPlayback: stopSlideshow(slideshowPlayback),
      });
      this.persist();
    }
    return ok;
  }

  setPresentation(presentation: PresentationStatus): void {
    if (shallowEqual(presentation, this.snapshot.presentation)) return;
    this.update({ presentation });
  }

  setDisplays(displays: readonly DisplayInfo[]): void {
    if (JSON.stringify(displays) === JSON.stringify(this.snapshot.displays)) return;
    this.update({ displays });
  }

  setPreferredDisplay(displayId: number | null): void {
    if (displayId === this.snapshot.preferredDisplayId) return;
    this.update({ preferredDisplayId: displayId });
    this.persist();
  }

  /** The Controller's colour theme. Saved, but never affects the game or the projector. */
  setControllerTheme(theme: ControllerTheme): void {
    if (theme === this.snapshot.controllerTheme) return;
    this.update({ controllerTheme: theme });
    this.persist();
  }

  /** Add or replace (by id) an operator notice. */
  addNotice(notice: Notice): void {
    const others = this.snapshot.notices.filter((n) => n.id !== notice.id);
    this.update({ notices: [...others, notice] });
  }

  dismissNotice(noticeId: string): void {
    if (!this.snapshot.notices.some((n) => n.id === noticeId)) return;
    this.update({ notices: this.snapshot.notices.filter((n) => n.id !== noticeId) });
  }

  /**
   * Whether the latest durable state is on disk.
   *  - saved:   every requested save has completed
   *  - failed:  the most recent save attempt failed (newer calls exist only in memory)
   *  - pending: a save is still being written
   */
  saveStatus(): SaveStatus {
    if (this.completedSaveId >= this.requestedSaveId) return 'saved';
    if (this.failedSaveId >= this.requestedSaveId) return 'failed';
    return 'pending';
  }

  /**
   * Wait until the latest durable state is saved or its save fails, up to
   * `timeoutMs`. Unlike a plain flush, the result says which happened, so the
   * caller never mistakes a failure or a slow disk for a completed save.
   */
  settleSaves(timeoutMs: number): Promise<SaveOutcome> {
    return new Promise<SaveOutcome>((resolve) => {
      const finish = (outcome: SaveOutcome) => {
        clearTimeout(timer);
        this.saveWaiters.delete(check);
        resolve(outcome);
      };
      const check = () => {
        const status = this.saveStatus();
        if (status !== 'pending') finish(status);
      };
      const timer = setTimeout(() => finish('timeout'), timeoutMs);
      this.saveWaiters.add(check);
      check();
    });
  }

  /** Save the current state again if the last save did not complete. */
  retrySave(): void {
    if (this.saveStatus() !== 'saved') this.persist();
  }

  /** The durable subset of the current state, as app data (not a file format). */
  getAppData(): AppData {
    return {
      game: this.snapshot.game,
      presentation: { mode: this.snapshot.presentationMode },
      patterns: {
        library: this.snapshot.patternLibrary,
        active: this.snapshot.activePattern,
        shown: this.snapshot.shownPattern,
      },
      media: { library: this.snapshot.mediaLibrary, singleImage: this.snapshot.singleImage },
      timer: this.snapshot.timer,
      slideshow: this.snapshot.slideshow,
      gameLog: this.snapshot.gameLog,
      settings: {
        preferredDisplayId: this.snapshot.preferredDisplayId,
        controllerTheme: this.snapshot.controllerTheme,
      },
    };
  }

  private persist(): void {
    // Save requests are numbered; the repository settles them in order, so
    // "completed >= requested" means the newest state is on disk.
    const saveId = ++this.requestedSaveId;
    this.persister.save(toPersistedState(this.getAppData(), this.now())).then(
      () => {
        this.completedSaveId = Math.max(this.completedSaveId, saveId);
        this.setPersistence({ kind: 'ok' });
        this.notifySaveWaiters();
      },
      (error: unknown) => {
        this.failedSaveId = Math.max(this.failedSaveId, saveId);
        this.setPersistence({
          kind: 'error',
          message: `Could not save game state: ${error instanceof Error ? error.message : String(error)}`,
          failedAt: this.now().toISOString(),
        });
        this.notifySaveWaiters();
      },
    );
  }

  private notifySaveWaiters(): void {
    // Waiters remove themselves when they finish; deleting during Set iteration is safe.
    for (const waiter of this.saveWaiters) waiter();
  }

  private setPersistence(persistence: PersistenceStatus): void {
    // Only publish transitions; a stream of successful saves is not news.
    if (persistence.kind === 'ok' && this.snapshot.persistence.kind === 'ok') return;
    this.update({ persistence });
  }

  private update(changes: Partial<MutableFields>): void {
    this.snapshot = Object.freeze({ ...this.snapshot, ...changes, revision: this.snapshot.revision + 1 });
    for (const listener of this.listeners) {
      try {
        listener(this.snapshot);
      } catch (error) {
        console.error('[AppStore] snapshot listener failed', error);
      }
    }
  }
}

function shallowEqual(a: object, b: object): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  return (
    aKeys.length === bKeys.length &&
    aKeys.every((key) => (a as Record<string, unknown>)[key] === (b as Record<string, unknown>)[key])
  );
}
