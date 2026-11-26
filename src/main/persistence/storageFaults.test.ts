import { promises as realFs } from 'node:fs';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppStore } from '../state/appStore';
import { createDefaultAppData, createDefaultPersistedState, type PersistedState } from './persistedState';
import { JsonStateRepository, type RepositoryFileSystem } from './stateRepository';

/**
 * Fault injection for storage problems an operator can really hit (design doc M5, card #45): a full disk, a locked or
 * read-only folder, a file another program has open, a folder that has gone, a disk error. The real store runs on
 * the real repository over a file system that fails the way Windows does, and each case checks what the operator
 * is told, that the saved game survives, and that Try again recovers once the problem is fixed.
 */

const errno = (code: string): NodeJS.ErrnoException =>
  Object.assign(new Error(`${code}: simulated, open '${path.join('C:', 'Users', 'me', 'state.json.tmp')}'`), {
    code,
  });

/** The real file system with one switchable fault: while `fault.current` is set, writing the temp file fails. */
function faultyFileSystem(fault: { current: NodeJS.ErrnoException | null }): RepositoryFileSystem {
  return {
    ...realFs,
    open: async (...args: Parameters<typeof realFs.open>) => {
      if (fault.current) throw fault.current;
      return realFs.open(...args);
    },
  };
}

const withBalls = (calledNumbers: number[]): PersistedState => ({
  ...createDefaultPersistedState(),
  game: { calledNumbers, bingoBannerVisible: false, disabledRows: [] },
});

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'bingo-faults-'));
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(dir, { recursive: true, force: true });
});

/** Wait until the store's saves have finished (succeeded or failed): never a guessed delay, which flakes under load. */
const settled = (store: AppStore) => store.settleSaves(10_000);

describe('a storage problem while the game is running', () => {
  it.each([
    ['ENOSPC', 'disk-full', /disk is full/],
    ['EDQUOT', 'disk-full', /disk is full/],
    ['EACCES', 'access-denied', /will not let the app write to its data folder/],
    ['EPERM', 'access-denied', /will not let the app write to its data folder/],
    ['EROFS', 'access-denied', /will not let the app write to its data folder/],
    ['EBUSY', 'file-busy', /another program/],
    ['ENOENT', 'folder-missing', /data folder is missing/],
    ['EIO', 'disk-error', /disk reported an error/],
  ] as const)(
    '%s: tells the operator plainly (%s), keeps the game, and Try again saves it once it is fixed',
    async (code, problem, words) => {
      const fault: { current: NodeJS.ErrnoException | null } = { current: null };
      const repository = new JsonStateRepository(path.join(dir, 'bingo-data'), {
        fileSystem: faultyFileSystem(fault),
      });
      await repository.save(withBalls([1, 2])); // a good game is already saved
      const store = new AppStore({
        initialData: {
          ...createDefaultAppData(),
          game: { ...createDefaultAppData().game, calledNumbers: [1, 2] as never },
        },
        persister: repository,
      });

      // The problem starts: the next call cannot be saved.
      fault.current = errno(code);
      store.dispatch({ area: 'game', command: { type: 'toggleBall', ball: 3 } });
      await settled(store);

      const status = store.getSnapshot().persistence;
      if (status.kind !== 'error') throw new Error('the failed save was not reported');
      expect(status.problem).toBe(problem);
      expect(status.message).toMatch(words);
      expect(status.message).toMatch(/Try again/);
      // Nothing the operator reads names a path, an internal file or a Windows error code.
      expect(status.message).not.toMatch(/state\.json|\.tmp|\.bak|Users|[A-Za-z]:\\|E[A-Z]{3,5}\b/);

      // The game on screen is right, and the game on disk is the last good one, not a half-written file.
      expect(store.getSnapshot().game.calledNumbers).toEqual([1, 2, 3]);
      const onDisk = JSON.parse(await readFile(repository.filePath, 'utf8')) as PersistedState;
      expect(onDisk.game.calledNumbers).toEqual([1, 2]);
      expect((await repository.load()).state.game.calledNumbers).toEqual([1, 2]);

      // The problem is fixed (space freed, program closed, drive back) and the operator presses Try again.
      fault.current = null;
      store.retrySave();
      await settled(store);
      expect(store.getSnapshot().persistence).toEqual({ kind: 'ok' });
      const recovered = new JsonStateRepository(repository.directory);
      expect((await recovered.load()).state.game.calledNumbers).toEqual([1, 2, 3]);
      expect((await recovered.load()).source).toBe('primary');
    },
  );

  it('keeps reporting the problem while it lasts, and each Try again fails the same plain way', async () => {
    const fault = { current: errno('ENOSPC') as NodeJS.ErrnoException | null };
    const repository = new JsonStateRepository(path.join(dir, 'bingo-data'), {
      fileSystem: faultyFileSystem(fault),
    });
    const store = new AppStore({ initialData: createDefaultAppData(), persister: repository });
    store.dispatch({ area: 'game', command: { type: 'toggleBall', ball: 7 } });
    await settled(store);
    const first = store.getSnapshot().persistence;
    store.retrySave();
    await settled(store);
    store.retrySave();
    await settled(store);
    expect(store.getSnapshot().persistence).toMatchObject({ kind: 'error', problem: 'disk-full' });
    expect(store.getSnapshot().persistence.kind === 'error' && first.kind === 'error').toBe(true);
    // Calls made while it fails are kept in memory and all reach the disk once it works.
    store.dispatch({ area: 'game', command: { type: 'toggleBall', ball: 8 } });
    fault.current = null;
    store.retrySave();
    await settled(store);
    expect(store.getSnapshot().persistence).toEqual({ kind: 'ok' });
    expect((await new JsonStateRepository(repository.directory).load()).state.game.calledNumbers).toEqual([
      7, 8,
    ]);
  });

  it('leaves no half-written file where the game is read from, and no temp file after it recovers', async () => {
    const fault: { current: NodeJS.ErrnoException | null } = { current: null };
    const repository = new JsonStateRepository(path.join(dir, 'bingo-data'), {
      fileSystem: faultyFileSystem(fault),
    });
    await repository.save(withBalls([4]));
    fault.current = errno('ENOSPC');
    await expect(repository.save(withBalls([4, 5]))).rejects.toMatchObject({ code: 'ENOSPC' });
    fault.current = null;
    await repository.save(withBalls([4, 5]));
    expect(await readdir(repository.directory)).not.toContain('state.json.tmp');
    expect((await repository.load()).state.game.calledNumbers).toEqual([4, 5]);
  });
});

describe('a file that is locked by another program', () => {
  /** The real file system, except a rename of the new file over the game fails with `code`. */
  const lockedRename = (code: string): RepositoryFileSystem => ({
    ...realFs,
    rename: async (from, to) => {
      if (String(to).endsWith('state.json')) throw errno(code);
      return realFs.rename(from, to);
    },
  });

  it('keeps the old game and its backup when the replace keeps failing, then saves when the lock lets go', async () => {
    const directory = path.join(dir, 'bingo-data');
    const healthy = new JsonStateRepository(directory);
    await healthy.save(withBalls([1]));
    await healthy.save(withBalls([1, 2])); // primary [1, 2], backup [1]

    const stuck = new JsonStateRepository(directory, { fileSystem: lockedRename('EBUSY') });
    await expect(stuck.save(withBalls([1, 2, 3]))).rejects.toMatchObject({ code: 'EBUSY' });
    expect(JSON.parse(await readFile(healthy.filePath, 'utf8')).game.calledNumbers).toEqual([1, 2]);

    await healthy.save(withBalls([1, 2, 3])); // the lock is gone
    expect(JSON.parse(await readFile(healthy.filePath, 'utf8')).game.calledNumbers).toEqual([1, 2, 3]);
  });

  it('rides out a lock that lets go within a moment (antivirus scanning the file)', async () => {
    const directory = path.join(dir, 'bingo-data');
    let locked = 3;
    const brief: RepositoryFileSystem = {
      ...realFs,
      rename: async (from, to) => {
        if (String(to).endsWith('state.json') && locked-- > 0) throw errno('EBUSY');
        return realFs.rename(from, to);
      },
    };
    const repository = new JsonStateRepository(directory, { fileSystem: brief });
    await expect(repository.save(withBalls([9]))).resolves.toBeUndefined();
    expect((await repository.load()).state.game.calledNumbers).toEqual([9]);
  });
});

describe('a saved game that cannot be opened at start-up', () => {
  /** The real file system, except reading the named file fails with `code` (a lock, or a permission). */
  const unreadable = (fileName: string, code: string): RepositoryFileSystem => ({
    ...realFs,
    readFile: (async (file: Parameters<typeof realFs.readFile>[0], ...rest: unknown[]) => {
      if (String(file).endsWith(fileName)) throw errno(code);
      return (realFs.readFile as (...args: unknown[]) => Promise<unknown>)(file, ...rest);
    }) as typeof realFs.readFile,
  });

  it('reports a locked primary as blocked, not damaged, and leaves the file where it is', async () => {
    const directory = path.join(dir, 'bingo-data');
    const healthy = new JsonStateRepository(directory);
    await healthy.save(withBalls([1]));
    await healthy.save(withBalls([1, 2, 3]));

    const locked = new JsonStateRepository(directory, { fileSystem: unreadable('state.json', 'EBUSY') });
    const loaded = await locked.load();
    expect(loaded.blocked).toBe(true);
    expect(loaded.source).toBe('backup'); // the older copy is used, and the operator is told
    expect(loaded.state.game.calledNumbers).toEqual([1]);

    // The newer game was NOT moved aside or touched: it is still there to be recovered.
    expect(JSON.parse(await readFile(healthy.filePath, 'utf8')).game.calledNumbers).toEqual([1, 2, 3]);
    expect((await readdir(directory)).some((file) => file.includes('.unreadable-'))).toBe(false);
  });

  it('starts a new game when nothing can be opened, but says nothing was deleted', async () => {
    const directory = path.join(dir, 'bingo-data');
    const healthy = new JsonStateRepository(directory);
    await healthy.save(withBalls([6]));

    const loaded = await new JsonStateRepository(directory, {
      fileSystem: unreadable('state.json', 'EACCES'),
    }).load();
    expect(loaded).toMatchObject({ source: 'defaults', blocked: true });
    expect(JSON.parse(await readFile(healthy.filePath, 'utf8')).game.calledNumbers).toEqual([6]);
  });

  it('does not call a plain damaged file blocked', async () => {
    const directory = path.join(dir, 'bingo-data');
    const healthy = new JsonStateRepository(directory);
    await healthy.save(withBalls([2]));
    await realFs.writeFile(healthy.filePath, '{"broken', 'utf8');
    expect((await healthy.load()).blocked).toBe(false);
  });
});
