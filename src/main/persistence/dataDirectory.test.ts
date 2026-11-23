import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LEGACY_USER_DATA_FOLDER, migrateLegacyDataDirectory, resolveDataDirectory } from './dataDirectory';

describe('migrateLegacyDataDirectory', () => {
  let appData: string;
  let userData: string;
  let legacyData: string;

  beforeEach(async () => {
    appData = await mkdtemp(path.join(os.tmpdir(), 'bingo-migrate-'));
    userData = path.join(appData, 'Basic Bingo');
    legacyData = resolveDataDirectory(path.join(appData, LEGACY_USER_DATA_FOLDER));
  });

  afterEach(async () => {
    await rm(appData, { recursive: true, force: true });
  });

  async function writeLegacy(): Promise<void> {
    await mkdir(path.join(legacyData, 'media'), { recursive: true });
    await writeFile(path.join(legacyData, 'state.json'), '{"old":true}');
    await writeFile(path.join(legacyData, 'media', 'a.png'), 'image');
  }

  it('copies the old data (state and media) and leaves the original in place', async () => {
    await writeLegacy();

    expect(await migrateLegacyDataDirectory(appData, userData)).toBe(true);

    const target = resolveDataDirectory(userData);
    expect(await readFile(path.join(target, 'state.json'), 'utf8')).toBe('{"old":true}');
    expect(await readFile(path.join(target, 'media', 'a.png'), 'utf8')).toBe('image');
    expect(await readFile(path.join(legacyData, 'state.json'), 'utf8')).toBe('{"old":true}');
    await expect(stat(`${target}.migrating`)).rejects.toThrow();
  });

  it('never overwrites data that already exists in the new location', async () => {
    await writeLegacy();
    const target = resolveDataDirectory(userData);
    await mkdir(target, { recursive: true });
    await writeFile(path.join(target, 'state.json'), '{"new":true}');

    expect(await migrateLegacyDataDirectory(appData, userData)).toBe(false);
    expect(await readFile(path.join(target, 'state.json'), 'utf8')).toBe('{"new":true}');
  });

  it('does nothing on a fresh install with no old data', async () => {
    expect(await migrateLegacyDataDirectory(appData, userData)).toBe(false);
    await expect(stat(resolveDataDirectory(userData))).rejects.toThrow();
  });

  it('does nothing when the new folder is the old folder', async () => {
    await writeLegacy();
    expect(await migrateLegacyDataDirectory(appData, path.join(appData, LEGACY_USER_DATA_FOLDER))).toBe(
      false,
    );
  });
});
