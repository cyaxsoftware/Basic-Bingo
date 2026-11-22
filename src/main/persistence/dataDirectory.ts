import path from 'node:path';

/**
 * App-owned data lives in its own folder under Electron's userData directory
 * so it is never mixed with Chromium caches, and so future media folders can
 * sit alongside it (e.g. bingo-data/media/).
 *
 * Windows: %APPDATA%\Offline Bingo Display\bingo-data
 */
export const DATA_DIRECTORY_NAME = 'bingo-data';

export function resolveDataDirectory(userDataPath: string): string {
  return path.join(userDataPath, DATA_DIRECTORY_NAME);
}
