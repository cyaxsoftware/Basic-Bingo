import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultAppData, fromPersistedState } from '../persistence/persistedState';
import { JsonStateRepository } from '../persistence/stateRepository';
import { AppStore } from '../state/appStore';
import { ImageLibraryService } from './mediaService';
import { PowerPointImportService } from './powerPointImport';
import { pngBytes } from './testImages';

let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'bingo-pptx-test-'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true, maxRetries: 3 });
});

function setup() {
  const repository = new JsonStateRepository(directory);
  const store = new AppStore({ initialData: createDefaultAppData(), persister: repository });
  store.dispatch({ area: 'slideshow', command: { type: 'create', name: 'Sponsors' } });
  const collectionId = store.getSnapshot().slideshow.activeId;
  if (collectionId === null) throw new Error('Expected an active collection.');
  const mediaDirectory = path.join(directory, 'media');
  const media = new ImageLibraryService({ store, directory: mediaDirectory, pickFiles: async () => [] });
  return { store, collectionId, media, mediaDirectory };
}

describe('PowerPoint slideshow import', () => {
  it('appends slides in presentation order twice and restores the plain PNGs and settings from disk', async () => {
    const { store, collectionId, media, mediaDirectory } = setup();
    const source = path.join(directory, 'Sponsor’s night (2026).PPTX');
    await writeFile(source, 'Source stays as selected.');
    store.dispatch({
      area: 'slideshow',
      command: { type: 'setInterval', collectionId, secondsPerSlide: 13 },
    });
    const options = { count: 12, width: 1920, height: 1080 };
    const workspaces: string[] = [];
    const convert = vi.fn(async (_input: string, output: string) => {
      workspaces.push(output);
      for (let index = options.count; index > 0; index--) {
        await writeFile(path.join(output, `slide-${index}.png`), pngBytes(options.width, options.height));
      }
      return options;
    });
    const importer = new PowerPointImportService({
      media,
      pickDeck: async () => source,
      exportDeck: convert,
    });

    expect(await importer.importDeck(collectionId)).toEqual({ ok: true });
    const originals = store.getSnapshot().slideshow.collections[0]?.slides ?? [];
    const first = originals[0];
    if (!first) throw new Error('No slides were imported.');
    store.dispatch({
      area: 'slideshow',
      command: { type: 'setSlideFit', collectionId, mediaId: first.mediaId, fit: 'original' },
    });
    store.dispatch({ area: 'slideshow', command: { type: 'create', name: 'Other collection' } });
    expect(await importer.importDeck(collectionId)).toEqual({ ok: true });
    expect(await store.settleSaves(2000)).toBe('saved');

    const loaded = await new JsonStateRepository(directory).load();
    expect(loaded.issues).toEqual([]);
    const restored = fromPersistedState(loaded.state);
    const collection = restored.slideshow.collections[0];
    const slides = collection?.slides ?? [];
    const expectedNames = Array.from(
      { length: options.count },
      (_, index) => `Sponsor’s night (2026) · Slide ${index + 1}.png`,
    );
    expect(slides.map(({ image }) => image?.name)).toEqual([...expectedNames, ...expectedNames]);
    expect(new Set(slides.map(({ mediaId }) => mediaId)).size).toBe(24);
    expect(slides[0]).toMatchObject({
      mediaId: first.mediaId,
      fit: 'original',
      image: { width: 1920, height: 1080 },
    });
    expect(collection?.secondsPerSlide).toBe(13);
    expect(restored.slideshow.collections[1]?.slides).toEqual([]);
    expect(restored.media.library).toEqual([]);
    expect(restored.media.singleImage.imageId).toBeNull();
    expect(await readdir(mediaDirectory)).toHaveLength(24);
    expect(await readFile(source, 'utf8')).toBe('Source stays as selected.');
    expect(workspaces).toHaveLength(2);
    for (const workspace of workspaces)
      await expect(readdir(workspace)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(convert).toHaveBeenCalledWith(source, expect.any(String));
  });

  it('keeps non-widescreen dimensions and leaves the gallery untouched', async () => {
    const { store, collectionId, media } = setup();
    const importer = new PowerPointImportService({
      media,
      pickDeck: async () => path.join(directory, '4-by-3.pptx'),
      exportDeck: async (_source, output) => {
        await writeFile(path.join(output, 'slide-1.png'), pngBytes(1920, 1440));
        return { count: 1, width: 1920, height: 1440 };
      },
    });
    expect(await importer.importDeck(collectionId)).toEqual({ ok: true });
    expect(store.getSnapshot().slideshow.collections[0]?.slides[0]?.image).toMatchObject({
      width: 1920,
      height: 1440,
      format: 'png',
    });
    expect(store.getSnapshot().mediaLibrary).toEqual([]);
    await store.settleSaves(2000);
  });

  it('discards a partial batch and its files if PowerPoint exports a slide at the wrong size', async () => {
    const { store, collectionId, media, mediaDirectory } = setup();
    let workspace = '';
    const importer = new PowerPointImportService({
      media,
      pickDeck: async () => path.join(directory, 'Sponsors.pptx'),
      exportDeck: async (_source, output) => {
        workspace = output;
        await writeFile(path.join(output, 'slide-1.png'), pngBytes(1920, 1080));
        await writeFile(path.join(output, 'slide-2.png'), pngBytes(640, 480));
        return { count: 2, width: 1920, height: 1080 };
      },
    });
    expect(await importer.importDeck(collectionId)).toEqual({
      ok: false,
      error:
        'Could not import Sponsors · Slide 2.png: PowerPoint exported an unexpected image size or format.',
    });
    expect(store.getSnapshot().slideshow.collections[0]?.slides).toEqual([]);
    expect(await readdir(mediaDirectory)).toEqual([]);
    await expect(readdir(workspace)).rejects.toMatchObject({ code: 'ENOENT' });
    await store.settleSaves(2000);
  });

  it('reports conversion failures and cleans the workspace, and skips conversion on cancel or a wrong extension', async () => {
    const { store, collectionId, media } = setup();
    let selection: string | null = null;
    let workspace = '';
    const exportDeck = vi.fn(async (_source: string, output: string) => {
      workspace = output;
      await writeFile(path.join(output, 'slide-1.png'), pngBytes(1920, 1080));
      throw new Error('Desktop PowerPoint is unavailable.');
    });
    const importer = new PowerPointImportService({ media, pickDeck: async () => selection, exportDeck });
    expect(await importer.importDeck(collectionId)).toEqual({ ok: true });
    selection = path.join(directory, 'Original.ppt');
    expect(await importer.importDeck(collectionId)).toEqual({
      ok: false,
      error: 'Choose a .pptx presentation.',
    });
    expect(exportDeck).not.toHaveBeenCalled();
    selection = path.join(directory, 'Original.pptx');
    expect(await importer.importDeck(collectionId)).toEqual({
      ok: false,
      error: 'Desktop PowerPoint is unavailable.',
    });
    expect(store.getSnapshot().slideshow.collections[0]?.slides).toEqual([]);
    await expect(readdir(workspace)).rejects.toMatchObject({ code: 'ENOENT' });
    await store.settleSaves(2000);
  });

  it('serializes PowerPoint imports and rolls back if the original destination is deleted', async () => {
    const { store, collectionId, media, mediaDirectory } = setup();
    let resumeExport: (() => void) | undefined;
    const pauseExport = new Promise<void>((resolve) => {
      resumeExport = resolve;
    });
    const importer = new PowerPointImportService({
      media,
      pickDeck: async () => path.join(directory, 'Sponsors.pptx'),
      exportDeck: async (_source, output) => {
        await pauseExport;
        await writeFile(path.join(output, 'slide-1.png'), pngBytes(1920, 1080));
        return { count: 1, width: 1920, height: 1080 };
      },
    });
    const pending = importer.importDeck(collectionId);
    expect(await importer.importDeck(collectionId)).toEqual({
      ok: false,
      error: 'A PowerPoint import is already in progress.',
    });
    store.dispatch({ area: 'slideshow', command: { type: 'delete', collectionId } });
    resumeExport?.();
    expect(await pending).toMatchObject({ ok: false, error: expect.stringContaining('no longer exists') });
    expect(await readdir(mediaDirectory)).toEqual([]);
    await store.settleSaves(2000);
  });
});
