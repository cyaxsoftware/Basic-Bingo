import { readdir, unlink } from 'node:fs/promises';
import path from 'node:path';

const ENGLISH_PACKS = new Set(['en-US.pak', 'en-GB.pak']);

/** Trim the temporary Electron runtime before both Windows makers consume it. */
export async function keepEnglishLocalePacks(buildPath: string): Promise<void> {
  const directory = path.join(buildPath, 'locales');
  const packs = (await readdir(directory, { withFileTypes: true })).filter(
    (entry) => entry.isFile() && entry.name.endsWith('.pak'),
  );
  // Chromium falls back to US English when the preferred language is unavailable.
  if (!packs.some((pack) => pack.name === 'en-US.pak')) {
    throw new Error('The extracted Electron runtime is missing its en-US.pak fallback.');
  }
  await Promise.all(
    packs
      .filter((pack) => !ENGLISH_PACKS.has(pack.name))
      .map((pack) => unlink(path.join(directory, pack.name))),
  );
}
