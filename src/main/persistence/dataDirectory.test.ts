import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  isTestDataRedirect,
  LEGACY_USER_DATA_FOLDER,
  legacyCopyFailedNotice,
  legacyDataDirectory,
  migrateLegacyDataDirectory,
  resolveDataDirectory,
} from './dataDirectory';

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

  it('starts from nothing when an interrupted copy left a staging folder, so stale files are never published', async () => {
    await writeLegacy();
    const target = resolveDataDirectory(userData);
    // An earlier, interrupted run: it staged state.json and a media file that has since been deleted at the source.
    await mkdir(path.join(`${target}.migrating`, 'media'), { recursive: true });
    await writeFile(path.join(`${target}.migrating`, 'state.json'), '{"stale":true}');
    await writeFile(path.join(`${target}.migrating`, 'media', 'gone.png'), 'gone');

    expect(await migrateLegacyDataDirectory(appData, userData)).toBe(true);

    expect(await readFile(path.join(target, 'state.json'), 'utf8')).toBe('{"old":true}');
    await expect(stat(path.join(target, 'media', 'gone.png'))).rejects.toThrow();
    expect(await readFile(path.join(target, 'media', 'a.png'), 'utf8')).toBe('image');
    await expect(stat(`${target}.migrating`)).rejects.toThrow();
  });

  it('does nothing when the new folder is the old folder', async () => {
    await writeLegacy();
    expect(await migrateLegacyDataDirectory(appData, path.join(appData, LEGACY_USER_DATA_FOLDER))).toBe(
      false,
    );
  });
});

// Built with path.join, so there are no backslash escapes to get wrong.
const ROAMING = path.join(os.tmpdir(), 'Roaming');
const REDIRECT = path.join(os.tmpdir(), 'bingo-test-data');

describe('isTestDataRedirect', () => {
  it('redirects only an unpackaged run that has the variable set', () => {
    expect(isTestDataRedirect({ BINGO_USER_DATA_DIR: REDIRECT }, false)).toBe(true);
    expect(isTestDataRedirect({}, false)).toBe(false);
    expect(isTestDataRedirect({ BINGO_USER_DATA_DIR: '' }, false)).toBe(false);
  });

  it('never redirects a packaged app, so a stray variable cannot skip the copy of the old data', () => {
    expect(isTestDataRedirect({ BINGO_USER_DATA_DIR: REDIRECT }, true)).toBe(false);
  });
});

describe('legacyCopyFailedNotice', () => {
  it('says what failed, where the old data is safe and where to copy it', () => {
    const notice = legacyCopyFailedNotice(
      new Error('EBUSY: resource busy or locked'),
      legacyDataDirectory(ROAMING),
      path.join(ROAMING, 'Basic Bingo', 'bingo-data'),
    );
    expect(notice).toMatchObject({ id: 'legacy-data-not-copied', level: 'error' });
    expect(notice.message).toContain('EBUSY');
    expect(notice.message).toContain('Offline Bingo Display');
    expect(notice.message).toContain('Basic Bingo');
  });

  it('copes with an error that is not an Error', () => {
    expect(legacyCopyFailedNotice('disk full', 'a', 'b').message).toContain('disk full');
  });
});
