/**
 * Durable JSON storage for {@link PersistedState}.
 *
 * Files (all inside the app-owned data directory, see dataDirectory.ts):
 *   state.json            current state
 *   state.json.bak        previous good state (last-known-good)
 *   state.json.tmp        in-progress write; never read
 *   state.json.unreadable-<timestamp>  quarantined file that failed to load
 *
 * Save is atomic: write tmp -> fsync -> copy current to .bak -> rename tmp over
 * state.json. A crash at any point leaves either the old or the new complete
 * file at state.json, plus a backup.
 *
 * Saves are serialized and coalesced: while one write is in flight, further
 * saves replace each other and only the newest is written next. Every save()
 * promise settles once its state (or a newer one) is on disk, or rejects with
 * the write error. Failures are never swallowed.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createDefaultPersistedState, parsePersistedState, type PersistedState } from './persistedState';

export const STATE_FILE_NAME = 'state.json';

export type LoadSource = 'primary' | 'backup' | 'defaults';

export interface LoadResult {
  readonly state: PersistedState;
  /** Where the state came from. Anything other than 'primary' deserves an operator notice. */
  readonly source: LoadSource;
  /** Problems found while loading (quarantined files, normalized data). */
  readonly issues: readonly string[];
}

/** Persistence port used by the app store; lets tests substitute a fake. */
export interface StatePersister {
  save(state: PersistedState): Promise<void>;
  /** Resolves when every pending save has finished (successfully or not). */
  flush(): Promise<void>;
}

interface Waiter {
  resolve(): void;
  reject(error: unknown): void;
}

/** Windows can briefly lock files (antivirus, indexer). Retry these. */
const RETRYABLE_CODES = new Set(['EPERM', 'EBUSY', 'EACCES']);
const RENAME_ATTEMPTS = 5;

export class JsonStateRepository implements StatePersister {
  readonly filePath: string;
  readonly backupPath: string;
  readonly tempPath: string;

  private pending: { state: PersistedState; waiters: Waiter[] } | null = null;
  private inFlight: Promise<void> | null = null;

  constructor(
    readonly directory: string,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.filePath = path.join(directory, STATE_FILE_NAME);
    this.backupPath = `${this.filePath}.bak`;
    this.tempPath = `${this.filePath}.tmp`;
  }

  /**
   * Load state: primary file, then backup, then defaults. Unreadable files are
   * renamed aside (never deleted) so they can be inspected and are not
   * overwritten by the next save.
   */
  async load(): Promise<LoadResult> {
    const issues: string[] = [];
    const candidates: Array<[LoadSource, string]> = [
      ['primary', this.filePath],
      ['backup', this.backupPath],
    ];

    for (const [source, filePath] of candidates) {
      let text: string;
      try {
        text = await fs.readFile(filePath, 'utf8');
      } catch (error) {
        if (isErrnoCode(error, 'ENOENT')) continue;
        issues.push(`Could not read ${path.basename(filePath)}: ${errorMessage(error)}`);
        continue;
      }

      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch (error) {
        issues.push(`${path.basename(filePath)} is not valid JSON (${errorMessage(error)}).`);
        issues.push(await this.quarantine(filePath));
        continue;
      }

      const parsed = parsePersistedState(json);
      if (!parsed.ok) {
        issues.push(`${path.basename(filePath)}: ${parsed.error}`);
        issues.push(await this.quarantine(filePath));
        continue;
      }

      issues.push(...parsed.warnings);
      return { state: parsed.state, source, issues };
    }

    return { state: createDefaultPersistedState(this.now()), source: 'defaults', issues };
  }

  save(state: PersistedState): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (this.pending) {
        this.pending.state = state;
        this.pending.waiters.push({ resolve, reject });
      } else {
        this.pending = { state, waiters: [{ resolve, reject }] };
      }
      this.startNextWrite();
    });
  }

  async flush(): Promise<void> {
    while (this.inFlight || this.pending) {
      await this.inFlight?.catch(() => undefined);
      if (!this.inFlight && this.pending) this.startNextWrite();
    }
  }

  private startNextWrite(): void {
    if (this.inFlight || !this.pending) return;
    const job = this.pending;
    this.pending = null;
    this.inFlight = this.writeAtomically(job.state)
      .then(
        () => job.waiters.forEach((w) => w.resolve()),
        (error: unknown) => job.waiters.forEach((w) => w.reject(error)),
      )
      .finally(() => {
        this.inFlight = null;
        this.startNextWrite();
      });
  }

  private async writeAtomically(state: PersistedState): Promise<void> {
    await fs.mkdir(this.directory, { recursive: true });
    const json = `${JSON.stringify({ ...state, savedAt: this.now().toISOString() }, null, 2)}\n`;

    const handle = await fs.open(this.tempPath, 'w');
    try {
      await handle.writeFile(json, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }

    try {
      await fs.copyFile(this.filePath, this.backupPath);
    } catch (error) {
      if (!isErrnoCode(error, 'ENOENT')) throw error;
    }

    await renameWithRetry(this.tempPath, this.filePath);
  }

  private async quarantine(filePath: string): Promise<string> {
    const stamp = this.now().toISOString().replace(/[:.]/g, '-');
    const target = `${filePath}.unreadable-${stamp}`;
    try {
      await fs.rename(filePath, target);
      return `Moved unreadable file to ${path.basename(target)}.`;
    } catch (error) {
      return `Could not move unreadable file ${path.basename(filePath)} aside: ${errorMessage(error)}`;
    }
  }
}

async function renameWithRetry(from: string, to: string): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await fs.rename(from, to);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code ?? '';
      if (attempt >= RENAME_ATTEMPTS || !RETRYABLE_CODES.has(code)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 25 * attempt));
    }
  }
}

function isErrnoCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && (error as NodeJS.ErrnoException).code === code;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
