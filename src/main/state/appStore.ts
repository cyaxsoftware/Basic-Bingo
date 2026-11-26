/**
 * The authoritative application state, owned by the main process.
 *
 * Responsibilities:
 *  - apply app commands through the shared reducer (one at a time; Node's
 *    event loop serializes IPC calls, so no locking is needed)
 *  - track the window state (presentation window, displays, notices, save status)
 *  - save the app data after each change to it, without blocking
 *  - publish an immutable snapshot with a strictly increasing revision
 *
 * The rules themselves live in src/shared/app/appState.ts, so the renderer test fake applies exactly the same ones.
 * Nothing here imports Electron, so it is fully unit-testable.
 */
import { randomUUID } from 'node:crypto';
import { reduceAppState, type AppCommand, type AppState } from '../../shared/app/appState';
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
import { classifyStorageError, describeSaveFailure } from '../../shared/storage/storageProblem';
import { STOPPED_SLIDESHOW } from '../../shared/media/slideshowPlayback';
import { toPersistedState, type AppData } from '../persistence/persistedState';
import type { StatePersister } from '../persistence/stateRepository';

export type SnapshotListener = (snapshot: AppSnapshot) => void;

/** Whether the latest durable state has reached disk. */
export type SaveStatus = 'saved' | 'failed' | 'pending';

/** How waiting for the latest save ended. */
export type SaveOutcome = 'saved' | 'failed' | 'timeout';

export interface AppStoreOptions {
  /** The app data loaded at startup (see fromPersistedState). */
  readonly initialData: AppData;
  readonly persister: StatePersister;
  readonly initialNotices?: readonly Notice[];
  readonly now?: () => Date;
  /** Ids for anything a command creates. Defaults to random UUIDs; tests pass something predictable. */
  readonly newId?: () => string;
}

type MutableFields = Omit<AppSnapshot, 'revision'>;

/** The app state fields that are app data (saved). A change to any of them is saved; slideshow playback is not. */
const SAVED_FIELDS = [
  'game',
  'presentationMode',
  'patternLibrary',
  'activePattern',
  'shownPattern',
  'mediaLibrary',
  'singleImage',
  'timer',
  'slideshow',
  'gameLog',
  'preferredDisplayId',
  'controllerTheme',
] as const satisfies readonly (keyof AppState)[];
const UNSAVED_FIELDS = ['slideshowPlayback'] as const satisfies readonly (keyof AppState)[];
// Every app state field must be listed as saved or not: a new one fails to compile here until it is.
type UnlistedField = Exclude<keyof AppState, (typeof SAVED_FIELDS)[number] | (typeof UNSAVED_FIELDS)[number]>;
const everyFieldListed: [UnlistedField] extends [never] ? true : UnlistedField = true;
void everyFieldListed;

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

  /**
   * Apply one app command (see reduceAppState): the game, patterns, media, slideshows, playback, the timer, the
   * presentation mode or a setting. A refused command leaves state untouched. A change is published at once, and
   * saved when any saved field changed (slideshow playback alone is never saved).
   */
  dispatch(command: AppCommand): CommandResult {
    const result = reduceAppState(this.snapshot, command, { now: this.now(), newId: this.newId });
    if (!result.ok) return fail(result.error);
    const before = this.snapshot;
    if (result.state === before) return ok;
    // The reducer was given the whole snapshot, so the window state and revision come back unchanged.
    this.update(result.state);
    if (SAVED_FIELDS.some((field) => result.state[field] !== before[field])) this.persist();
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
        // The raw error (with Windows' wording and the file path) goes to the log for support; the operator gets a
        // plain message that says what to do.
        console.error('[persistence] save failed', error);
        const problem = classifyStorageError(error);
        this.setPersistence({
          kind: 'error',
          message: describeSaveFailure(problem),
          problem,
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
