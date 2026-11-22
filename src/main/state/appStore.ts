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

  /** Wait for all pending writes. Call before quitting. */
  flush(): Promise<void> {
    return this.persister.flush();
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
    this.persister.save(this.toPersistedState()).then(
      () => this.setPersistence({ kind: 'ok' }),
      (error: unknown) =>
        this.setPersistence({
          kind: 'error',
          message: `Could not save game state: ${error instanceof Error ? error.message : String(error)}`,
          failedAt: this.now().toISOString(),
        }),
    );
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
