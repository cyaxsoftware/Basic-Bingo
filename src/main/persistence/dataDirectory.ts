import { cp, mkdir, rename, stat } from 'node:fs/promises';
import path from 'node:path';

/**
 * App-owned data lives in its own folder under Electron's userData directory
 * so it is never mixed with Chromium caches, and so future media folders can
 * sit alongside it (e.g. bingo-data/media/).
 *
 * Windows: %APPDATA%\Basic Bingo\bingo-data
 */
export const DATA_DIRECTORY_NAME = 'bingo-data';

/** The app was called "Offline Bingo Display" before it was renamed; Electron names userData after the app. */
export const LEGACY_USER_DATA_FOLDER = 'Offline Bingo Display';

export function resolveDataDirectory(userDataPath: string): string {
  return path.join(userDataPath, DATA_DIRECTORY_NAME);
}

async function exists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

/**
 * One-time carry-over after the rename: copy the saved game and media from the old app-name folder.
 * It copies (the old folder stays as a backup) into a temporary name and renames it into place, so a
 * crash mid-copy never leaves a half-copied folder that the next start would treat as real data.
 * It never touches an existing new data folder. Returns true when it copied something.
 */
export async function migrateLegacyDataDirectory(
  appDataPath: string,
  userDataPath: string,
): Promise<boolean> {
  const target = resolveDataDirectory(userDataPath);
  const legacy = resolveDataDirectory(path.join(appDataPath, LEGACY_USER_DATA_FOLDER));
  if (path.resolve(legacy) === path.resolve(target)) return false;
  if ((await exists(target)) || !(await exists(legacy))) return false;

  const staging = `${target}.migrating`;
  await mkdir(userDataPath, { recursive: true });
  await cp(legacy, staging, { recursive: true, force: true });
  await rename(staging, target);
  return true;
}
