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
import type { PersistedState } from '../persistence/persistedState';
import type { StatePersister } from '../persistence/stateRepository';

export type SnapshotListener = (snapshot: AppSnapshot) => void;

/** Whether the latest durable state has reached disk. */
export type SaveStatus = 'saved' | 'failed' | 'pending';

/** How waiting for the latest save ended. */
export type SaveOutcome = 'saved' | 'failed' | 'timeout';

export interface AppStoreOptions {
  readonly initialState: PersistedState;
  readonly persister: StatePersister;
  readonly initialNotices?: readonly Notice[];
  readonly now?: () => Date;
}

type MutableFields = Omit<AppSnapshot, 'revision'>;

export class AppStore {
  private snapshot: AppSnapshot;
  private readonly listeners = new Set<SnapshotListener>();
  private readonly persister: StatePersister;
  private readonly now: () => Date;
  private readonly baseState: PersistedState;
  private requestedSaveId = 0;
  private completedSaveId = 0;
  private failedSaveId = 0;
  private readonly saveWaiters = new Set<() => void>();

  constructor(options: AppStoreOptions) {
    this.persister = options.persister;
    this.now = options.now ?? (() => new Date());
    this.baseState = options.initialState;
    this.snapshot = Object.freeze<AppSnapshot>({
      revision: 1,
      game: options.initialState.game,
      presentation: { kind: 'closed' },
      displays: [],
      preferredDisplayId: options.initialState.settings.preferredDisplayId,
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
      this.update({ game: next });
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

  /** The durable subset of state, in its on-disk shape. */
  toPersistedState(): PersistedState {
    return {
      ...this.baseState,
      savedAt: this.now().toISOString(),
      game: this.snapshot.game,
      settings: { preferredDisplayId: this.snapshot.preferredDisplayId },
    };
  }

  private persist(): void {
    // Save requests are numbered; the repository settles them in order, so
    // "completed >= requested" means the newest state is on disk.
    const saveId = ++this.requestedSaveId;
    this.persister.save(this.toPersistedState()).then(
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
