import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { keepEnglishLocalePacks } from './englishLocales';

let buildPath: string;
let locales: string;

beforeEach(async () => {
  buildPath = await mkdtemp(path.join(os.tmpdir(), 'bingo-locale-test-'));
  locales = path.join(buildPath, 'locales');
  await mkdir(locales);
});

afterEach(async () => {
  await rm(buildPath, { recursive: true, force: true });
});

it('keeps both English packs and leaves other runtime files alone', async () => {
  await Promise.all(
    ['en-US.pak', 'en-GB.pak', 'fr.pak', 'es-419.pak', 'README.txt'].map((file) =>
      writeFile(path.join(locales, file), ''),
    ),
  );
  await writeFile(path.join(buildPath, 'resources.pak'), '');
  await keepEnglishLocalePacks(buildPath);
  expect((await readdir(locales)).toSorted()).toEqual(['README.txt', 'en-GB.pak', 'en-US.pak']);
  expect((await readdir(buildPath)).toSorted()).toEqual(['locales', 'resources.pak']);
});

it('fails before pruning if the US-English fallback is absent', async () => {
  await writeFile(path.join(locales, 'fr.pak'), '');
  await expect(keepEnglishLocalePacks(buildPath)).rejects.toThrow('en-US.pak');
  expect(await readdir(locales)).toEqual(['fr.pak']);
});
