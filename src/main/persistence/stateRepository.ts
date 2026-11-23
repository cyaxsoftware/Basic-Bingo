/**
 * Durable JSON storage for {@link PersistedState}.
 *
 * Files (all inside the app-owned data directory, see dataDirectory.ts):
 *   state.json            current state
 *   state.json.bak        last-known-good state; only ever a copy of a VALIDATED state.json
 *   state.json.tmp        in-progress write; never read
 *   state.json.unreadable-<timestamp>  quarantined file that failed to load
 *
 * Save sequence:
 *   1. write state.json.tmp and fsync it
 *   2. re-read state.json; if it is valid, copy it to state.json.bak.
 *      If it is invalid, move it aside (or, if that fails, leave .bak alone).
 *   3. rename the temp file over state.json
 * A crash at any point leaves a complete file at state.json or a valid backup.
 * The backup is never overwritten with content that has not just been validated,
 * so a damaged primary can never destroy the only good copy of the game.
 *
 * Saves are serialized and coalesced: while one write is in flight, further
 * saves replace each other and only the newest is written next. Every save()
 * promise settles once its state (or a newer one) is on disk, or rejects with
 * the write error. Failures are never swallowed.
 */
import { promises as nodeFs } from 'node:fs';
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
  /**
   * True when a saved file exists but could not be opened at all (another program has it locked, or Windows is
   * blocking it). That is different from a damaged file: the game may be perfectly good, just out of reach.
   */
  readonly blocked: boolean;
}

/** Persistence port used by the app store; lets tests substitute a fake. */
export interface StatePersister {
  /**
   * Resolves once this state (or a newer one) is on disk; rejects if the write
   * failed. Calls settle in the order they were made.
   */
  save(state: PersistedState): Promise<void>;
}

/** The file operations the repository uses. Injectable so tests can simulate failures. */
export type RepositoryFileSystem = Pick<typeof nodeFs, 'readFile' | 'mkdir' | 'open' | 'copyFile' | 'rename'>;

export interface JsonStateRepositoryOptions {
  readonly now?: () => Date;
  readonly fileSystem?: RepositoryFileSystem;
}

/** Result of reading and validating one state file. */
type FileCheck =
  | { readonly kind: 'missing' }
  | { readonly kind: 'valid'; readonly state: PersistedState; readonly warnings: readonly string[] }
  /** Read succeeded but the content is not a usable state. Safe to move aside. */
  | { readonly kind: 'invalid'; readonly reason: string }
  /** Could not be read at all (locked, permissions). Leave it alone. */
  | { readonly kind: 'unreadable'; readonly reason: string };

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

  private readonly now: () => Date;
  private readonly fs: RepositoryFileSystem;
  private pending: { state: PersistedState; waiters: Waiter[] } | null = null;
  private inFlight: Promise<void> | null = null;

  constructor(
    readonly directory: string,
    options: JsonStateRepositoryOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.fs = options.fileSystem ?? nodeFs;
    this.filePath = path.join(directory, STATE_FILE_NAME);
    this.backupPath = `${this.filePath}.bak`;
    this.tempPath = `${this.filePath}.tmp`;
  }

  /**
   * Load state: primary file, then backup, then defaults. Invalid files are
   * renamed aside (never deleted) so they can be inspected and are not
   * mistaken for good data later.
   */
  async load(): Promise<LoadResult> {
    const issues: string[] = [];
    let blocked = false;
    const candidates: Array<[LoadSource, string]> = [
      ['primary', this.filePath],
      ['backup', this.backupPath],
    ];

    for (const [source, filePath] of candidates) {
      const check = await this.checkFile(filePath);
      switch (check.kind) {
        case 'missing':
          continue;
        case 'unreadable':
          issues.push(check.reason);
          blocked = true;
          continue;
        case 'invalid':
          issues.push(check.reason);
          issues.push(await this.quarantine(filePath));
          continue;
        case 'valid':
          issues.push(...check.warnings);
          return { state: check.state, source, issues, blocked };
      }
    }

    return { state: createDefaultPersistedState(this.now()), source: 'defaults', issues, blocked };
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

  /**
   * Wait until no write is queued or in flight. Settles whether or not the
   * writes succeeded; to learn the outcome use the save() promises (the app
   * uses AppStore.settleSaves for this).
   */
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
    await this.fs.mkdir(this.directory, { recursive: true });
    const json = `${JSON.stringify({ ...state, savedAt: this.now().toISOString() }, null, 2)}\n`;

    const handle = await this.fs.open(this.tempPath, 'w');
    try {
      await handle.writeFile(json, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }

    await this.rotatePrimaryToBackup();
    await renameWithRetry(this.fs, this.tempPath, this.filePath);
  }

  /**
   * Make the current primary the new backup, but only if it is valid right now.
   * Anything else leaves the existing backup untouched.
   */
  private async rotatePrimaryToBackup(): Promise<void> {
    const primary = await this.checkFile(this.filePath);
    switch (primary.kind) {
      case 'valid':
        try {
          await this.fs.copyFile(this.filePath, this.backupPath);
        } catch (error) {
          // The old backup is still valid, just older. Saving the newest state matters more.
          console.warn(`[persistence] Could not refresh backup: ${errorMessage(error)}`);
        }
        return;
      case 'invalid':
        // Keep it for inspection if we can. If the move fails, the rename that
        // follows replaces it; either way the backup is never touched.
        console.warn(`[persistence] ${primary.reason} ${await this.quarantine(this.filePath)}`);
        return;
      case 'unreadable':
        console.warn(`[persistence] ${primary.reason} Backup left unchanged.`);
        return;
      case 'missing':
        return;
    }
  }

  private async checkFile(filePath: string): Promise<FileCheck> {
    const name = path.basename(filePath);
    let text: string;
    try {
      text = await this.fs.readFile(filePath, 'utf8');
    } catch (error) {
      if (isErrnoCode(error, 'ENOENT')) return { kind: 'missing' };
      return { kind: 'unreadable', reason: `Could not read ${name}: ${errorMessage(error)}` };
    }

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch (error) {
      return { kind: 'invalid', reason: `${name} is not valid JSON (${errorMessage(error)}).` };
    }

    const parsed = parsePersistedState(json);
    if (!parsed.ok) return { kind: 'invalid', reason: `${name}: ${parsed.error}` };
    return { kind: 'valid', state: parsed.state, warnings: parsed.warnings };
  }

  private async quarantine(filePath: string): Promise<string> {
    const stamp = this.now().toISOString().replace(/[:.]/g, '-');
    const target = `${filePath}.unreadable-${stamp}`;
    try {
      await this.fs.rename(filePath, target);
      return `Moved unreadable file to ${path.basename(target)}.`;
    } catch (error) {
      return `Could not move unreadable file ${path.basename(filePath)} aside: ${errorMessage(error)}`;
    }
  }
}

async function renameWithRetry(fs: RepositoryFileSystem, from: string, to: string): Promise<void> {
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
