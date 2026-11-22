import { promises as realFs } from 'node:fs';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultPersistedState, type PersistedState } from './persistedState';
import { JsonStateRepository, type RepositoryFileSystem } from './stateRepository';

function stateWith(calledNumbers: number[], preferredDisplayId: number | null = null): PersistedState {
  return { ...createDefaultPersistedState(), game: { calledNumbers }, settings: { preferredDisplayId } };
}

describe('JsonStateRepository', () => {
  let dir: string;
  let repo: JsonStateRepository;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'bingo-repo-'));
    repo = new JsonStateRepository(path.join(dir, 'bingo-data'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('returns defaults when no file exists', async () => {
    const result = await repo.load();
    expect(result.source).toBe('defaults');
    expect(result.state.game.calledNumbers).toEqual([]);
    expect(result.issues).toEqual([]);
  });

  it('round-trips the exact chronological sequence', async () => {
    await repo.save(stateWith([3, 17, 9], 42));
    const reloaded = await new JsonStateRepository(repo.directory).load();
    expect(reloaded.source).toBe('primary');
    expect(reloaded.state.game.calledNumbers).toEqual([3, 17, 9]);
    expect(reloaded.state.settings.preferredDisplayId).toBe(42);
  });

  it('keeps the previous good state as a backup and leaves no temp file', async () => {
    await repo.save(stateWith([1]));
    await repo.save(stateWith([1, 2]));
    const backup = JSON.parse(await readFile(repo.backupPath, 'utf8')) as PersistedState;
    expect(backup.game.calledNumbers).toEqual([1]);
    expect(await readdir(repo.directory)).not.toContain('state.json.tmp');
  });

  it('falls back to the backup when the primary file is corrupt, and quarantines it', async () => {
    await repo.save(stateWith([5]));
    await repo.save(stateWith([5, 6]));
    await writeFile(repo.filePath, '{"schemaVersion":1, "game": {"calledNu', 'utf8');

    const result = await repo.load();
    expect(result.source).toBe('backup');
    expect(result.state.game.calledNumbers).toEqual([5]);
    expect(result.issues.join(' ')).toMatch(/not valid JSON/);
    const files = await readdir(repo.directory);
    expect(files.some((f) => f.startsWith('state.json.unreadable-'))).toBe(true);
    expect(files).not.toContain('state.json');
  });

  it('returns defaults when both primary and backup are unreadable', async () => {
    await repo.save(stateWith([1]));
    await writeFile(repo.filePath, 'garbage', 'utf8');
    await writeFile(repo.backupPath, '[]', 'utf8');

    const result = await repo.load();
    expect(result.source).toBe('defaults');
    expect(result.state.game.calledNumbers).toEqual([]);
    expect(result.issues.length).toBeGreaterThanOrEqual(2);
  });

  it('refuses to load (and preserves) a file from a newer schema version', async () => {
    await repo.save(stateWith([1]));
    const newer = { schemaVersion: 99, game: { calledNumbers: [1, 2, 3] } };
    await writeFile(repo.filePath, JSON.stringify(newer), 'utf8');
    await rm(repo.backupPath, { force: true });

    const result = await repo.load();
    expect(result.source).toBe('defaults');
    expect(result.issues.join(' ')).toMatch(/newer version/);
    const files = await readdir(repo.directory);
    const quarantined = files.find((f) => f.startsWith('state.json.unreadable-'));
    expect(quarantined).toBeDefined();
    expect(JSON.parse(await readFile(path.join(repo.directory, quarantined!), 'utf8'))).toEqual(newer);
  });

  it('normalizes invalid or duplicate called numbers and reports it', async () => {
    await repo.save(stateWith([]));
    const dirty = {
      schemaVersion: 1,
      savedAt: 'x',
      game: { calledNumbers: [3, 3, 99, 'x', 9] },
      settings: {},
    };
    await writeFile(repo.filePath, JSON.stringify(dirty), 'utf8');

    const result = await repo.load();
    expect(result.source).toBe('primary');
    expect(result.state.game.calledNumbers).toEqual([3, 9]);
    expect(result.state.settings.preferredDisplayId).toBeNull();
    expect(result.issues.join(' ')).toMatch(/Removed 3 invalid or duplicate/);
  });

  it('coalesces rapid saves and always ends with the latest state', async () => {
    const saves: Promise<void>[] = [];
    let calls: number[] = [];
    for (let ball = 1; ball <= 30; ball++) {
      calls = [...calls, ball];
      saves.push(repo.save(stateWith(calls)));
    }
    await Promise.all(saves);
    const result = await repo.load();
    expect(result.state.game.calledNumbers).toEqual(calls);
  });

  it('flush waits for pending writes', async () => {
    void repo.save(stateWith([7]));
    void repo.save(stateWith([7, 8]));
    await repo.flush();
    const text = await readFile(repo.filePath, 'utf8');
    expect((JSON.parse(text) as PersistedState).game.calledNumbers).toEqual([7, 8]);
  });

  it('rejects save() when the directory cannot be written', async () => {
    // A file where the directory should be makes mkdir fail on every platform.
    const blocked = path.join(dir, 'blocked');
    await writeFile(blocked, 'not a directory', 'utf8');
    const badRepo = new JsonStateRepository(blocked);
    await expect(badRepo.save(stateWith([1]))).rejects.toThrow();
    await expect(badRepo.flush()).resolves.toBeUndefined();
  });

  describe('backup protection (audit finding 1, #18)', () => {
    const readCalls = async (file: string) =>
      (JSON.parse(await readFile(file, 'utf8')) as PersistedState).game.calledNumbers;

    /** Primary = [1, 2] but corrupted on disk; backup = [1] (valid). */
    async function corruptPrimaryWithGoodBackup() {
      await repo.save(stateWith([1]));
      await repo.save(stateWith([1, 2]));
      await writeFile(repo.filePath, '{"schemaVersion":1,"game":{"calledNu', 'utf8');
    }

    it('keeps the good backup when quarantine and the final replace both fail', async () => {
      await corruptPrimaryWithGoodBackup();
      const faulty = new JsonStateRepository(repo.directory, {
        fileSystem: withFailingRename((_from, to) => to.includes('.unreadable-') || to === repo.filePath),
      });

      const loaded = await faulty.load();
      expect(loaded.source).toBe('backup');
      expect(loaded.state.game.calledNumbers).toEqual([1]);
      expect(loaded.issues.join(' ')).toMatch(/Could not move unreadable file/);

      await expect(faulty.save(stateWith([1, 9]))).rejects.toThrow(/EPERM/);

      // After a restart with a healthy disk, the original backup still loads.
      const restarted = await new JsonStateRepository(repo.directory).load();
      expect(restarted.source).toBe('backup');
      expect(restarted.state.game.calledNumbers).toEqual([1]);
    });

    it('never copies an unreadable primary into the backup after a fallback load', async () => {
      await corruptPrimaryWithGoodBackup();
      const faulty = new JsonStateRepository(repo.directory, {
        fileSystem: withFailingRename((_from, to) => to.includes('.unreadable-')),
      });

      expect((await faulty.load()).source).toBe('backup');
      await faulty.save(stateWith([1, 9]));

      expect(await readCalls(repo.backupPath)).toEqual([1]);
      expect(await readCalls(repo.filePath)).toEqual([1, 9]);
    });

    it('protects the backup when the primary is corrupted between saves', async () => {
      await corruptPrimaryWithGoodBackup();
      await repo.save(stateWith([1, 2, 3]));

      expect(await readCalls(repo.backupPath)).toEqual([1]);
      expect(await readCalls(repo.filePath)).toEqual([1, 2, 3]);
      const files = await readdir(repo.directory);
      expect(files.some((f) => f.startsWith('state.json.unreadable-'))).toBe(true);
    });

    it('still saves the newest state when refreshing the backup fails', async () => {
      await repo.save(stateWith([4]));
      const faulty = new JsonStateRepository(repo.directory, {
        fileSystem: {
          ...realFs,
          copyFile: async () => {
            throw errno('EBUSY');
          },
        },
      });
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      await faulty.save(stateWith([4, 5]));
      warn.mockRestore();
      expect(await readCalls(repo.filePath)).toEqual([4, 5]);
    });
  });
});

function errno(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(`${code}: simulated failure`), { code });
}

/** Real file system, except rename() fails with EPERM when `shouldFail` matches. */
function withFailingRename(shouldFail: (from: string, to: string) => boolean): RepositoryFileSystem {
  return {
    ...realFs,
    rename: async (from, to) => {
      if (shouldFail(String(from), String(to))) throw errno('EPERM');
      return realFs.rename(from, to);
    },
  };
}
