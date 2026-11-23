import { cp, mkdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import type { Notice } from '../../shared/ipc/contract';

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

/** The old app-name data folder (where the saved game and media were before the rename). */
export function legacyDataDirectory(appDataPath: string): string {
  return resolveDataDirectory(path.join(appDataPath, LEGACY_USER_DATA_FOLDER));
}

/**
 * Whether automated tests have redirected the data folder. Only an unpackaged run can be redirected: a packaged
 * app ignores BINGO_USER_DATA_DIR so it can never point a real installation somewhere else. The redirect and the
 * legacy-data copy must agree on this, or a packaged app that happens to have the variable set would skip the copy
 * (and then save into the real folder, which stops the copy from ever happening).
 */
export function isTestDataRedirect(
  env: { readonly BINGO_USER_DATA_DIR?: string | undefined },
  packaged: boolean,
): boolean {
  return Boolean(env.BINGO_USER_DATA_DIR) && !packaged;
}

/** What the operator is told when the old data could not be copied: where it is, and how to bring it over. */
export function legacyCopyFailedNotice(error: unknown, legacyPath: string, newPath: string): Notice {
  const reason = error instanceof Error ? error.message : String(error);
  return {
    id: 'legacy-data-not-copied',
    level: 'error',
    message:
      `Your saved game and images from before the app was renamed could not be copied (${reason}). ` +
      `They are safe in "${legacyPath}". Close the app and any program using them, then copy that folder ` +
      `to "${newPath}" (this copy is only tried once, so it will not happen again by itself).`,
  };
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
  const legacy = legacyDataDirectory(appDataPath);
  if (path.resolve(legacy) === path.resolve(target)) return false;
  if ((await exists(target)) || !(await exists(legacy))) return false;

  const staging = `${target}.migrating`;
  await mkdir(userDataPath, { recursive: true });
  // A copy that was interrupted earlier leaves its staging folder behind. Start from nothing: copying over it
  // would keep files that no longer exist in the source (for example a primary file that has since gone) and
  // then publish that stale mix.
  await rm(staging, { recursive: true, force: true });
  await cp(legacy, staging, { recursive: true, force: true });
  await rename(staging, target);
  return true;
}
