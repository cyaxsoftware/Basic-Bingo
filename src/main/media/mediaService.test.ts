import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_IMAGE_BYTES, mediaFileName } from '../../shared/media';
import { createDefaultAppData } from '../persistence/persistedState';
import { AppStore } from '../state/appStore';
import {
  answerMediaRequest,
  ImageLibraryService,
  NOTICE_IMPORT_SKIPPED,
  NOTICE_MISSING_FILES,
} from './mediaService';
import { jpegBytes, pngBytes } from './testImages';

const ID_1 = '00000000-0000-4000-8000-000000000001';
const ID_2 = '00000000-0000-4000-8000-000000000002';
const ID_3 = '00000000-0000-4000-8000-000000000003';

let root: string;
let usb: string;
let mediaDirectory: string;
let saves: number;

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'bingo-media-'));
  usb = path.join(root, 'usb');
  mediaDirectory = path.join(root, 'bingo-data', 'media');
  await mkdir(usb);
  saves = 0;
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function setup(picks: readonly string[] = []) {
  const store = new AppStore({
    initialData: createDefaultAppData(),
    persister: {
      save: async () => {
        saves += 1;
      },
    },
  });
  const ids = [ID_1, ID_2, ID_3];
  const service = new ImageLibraryService({
    store,
    directory: mediaDirectory,
    pickFiles: async () => picks,
    now: () => new Date('2026-03-04T05:06:07.000Z'),
    newId: () => ids.shift() ?? '00000000-0000-4000-8000-0000000000ff',
  });
  return { store, service };
}

const usbFile = async (name: string, data: Buffer | string) => {
  const file = path.join(usb, name);
  await writeFile(file, data);
  return file;
};

describe('importing images', () => {
  it('removes the temporary copy when the final image cannot be saved', async () => {
    const { store, service } = setup();
    const target = `${ID_1}.png`;
    await mkdir(path.join(mediaDirectory, target), { recursive: true });
    const source = await usbFile('Sponsor.png', pngBytes(1920, 1080));
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const report = await service.importFiles([source]);
      expect(report.added).toEqual([]);
    } finally {
      log.mockRestore();
    }
    expect(store.getSnapshot().mediaLibrary).toEqual([]);
    expect(await readdir(mediaDirectory)).toEqual([target]);
  });
  it('appends picked files only to the requested collection and serves their thumbnails', async () => {
    const logo = await usbFile('Logo.png', pngBytes(640, 480));
    const menu = await usbFile('Menu.jpg', jpegBytes(800, 600));
    const { store, service } = setup([logo, menu]);
    store.dispatchSlideshow({ type: 'create', name: 'Sponsors' });
    const target = store.getSnapshot().slideshow.activeId;
    if (!target) throw new Error('No collection was created.');
    store.dispatchSlideshow({ type: 'create', name: 'Events' });
    const active = store.getSnapshot().slideshow.activeId;
    expect(await service.importImages(target)).toEqual({ ok: true });
    const { mediaLibrary, singleImage, slideshow } = store.getSnapshot();
    expect(mediaLibrary).toEqual([]);
    expect(singleImage.imageId).toBeNull();
    expect(slideshow.activeId).toBe(active);
    expect(slideshow.collections[0]?.slides.map(({ image }) => image?.name)).toEqual([
      'Logo.png',
      'Menu.jpg',
    ]);
    expect(slideshow.collections[1]?.slides).toEqual([]);
    expect((await answerMediaRequest(service, `bingo-media://${ID_1}`)).status).toBe(200);
  });

  it('cleans up copied files when their destination no longer exists', async () => {
    const logo = await usbFile('Logo.png', pngBytes(640, 480));
    const { store, service } = setup([logo]);
    store.dispatchSlideshow({ type: 'create', name: 'Sponsors' });
    const target = store.getSnapshot().slideshow.activeId;
    if (!target) throw new Error('No collection was created.');
    store.dispatchSlideshow({ type: 'delete', collectionId: target });
    const result = await service.importImages(target);
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('no longer exists') });
    expect(await readdir(mediaDirectory)).toEqual([]);
    expect(store.getSnapshot().mediaLibrary).toEqual([]);
  });
  it('copies the file into the media folder and records its metadata', async () => {
    const { store, service } = setup();
    const png = pngBytes(1200, 600);
    const source = await usbFile('Legion Sponsors.png', png);

    const report = await service.importFiles([source]);

    expect(report.skipped).toEqual([]);
    expect(report.added).toEqual([
      {
        id: ID_1,
        name: 'Legion Sponsors.png',
        format: 'png',
        bytes: png.length,
        width: 1200,
        height: 600,
        addedAt: '2026-03-04T05:06:07.000Z',
        fit: 'fit' as const,
      },
    ]);
    // A copy, under a generated name that is derived from the entry (not the original name or folder).
    expect(await readFile(path.join(mediaDirectory, `${ID_1}.png`))).toEqual(png);
    expect(store.getSnapshot().mediaLibrary).toEqual(report.added);
    // Saved, and no temporary file is left behind.
    expect(saves).toBeGreaterThan(0);
    expect(await readdir(mediaDirectory)).toEqual([`${ID_1}.png`]);
  });

  it('still has the image after the original is deleted (the USB stick is removed)', async () => {
    const { service } = setup();
    const png = pngBytes(100, 50);
    const source = await usbFile('logo.png', png);
    await service.importFiles([source]);

    await rm(usb, { recursive: true, force: true });

    expect(await service.readImage(ID_1)).toEqual({ data: png, mimeType: 'image/png' });
  });

  it('trusts the content, not the name: a JPEG called .png is stored and served as a JPEG', async () => {
    const { service } = setup();
    const source = await usbFile('photo.png', jpegBytes(640, 480));
    const { added } = await service.importFiles([source]);
    expect(added[0]).toMatchObject({ format: 'jpeg', width: 640, height: 480, name: 'photo.png' });
    expect(await readdir(mediaDirectory)).toEqual([mediaFileName({ id: ID_1, format: 'jpeg' })]);
    expect((await service.readImage(ID_1))?.mimeType).toBe('image/jpeg');
  });

  it('imports several at once, skipping the ones that are not usable, each with a reason', async () => {
    const { store, service } = setup();
    const good = await usbFile('good.png', pngBytes(10, 10));
    const text = await usbFile('notes.png', 'just some text');
    const empty = await usbFile('empty.png', Buffer.alloc(0));
    const huge = await usbFile('huge.png', Buffer.concat([pngBytes(10, 10), Buffer.alloc(MAX_IMAGE_BYTES)]));
    const missing = path.join(usb, 'gone.png');
    const folder = path.join(usb, 'a-folder');
    await mkdir(folder);
    const another = await usbFile('another.png', pngBytes(20, 20));

    const report = await service.importFiles([good, text, empty, huge, missing, folder, another]);

    expect(report.added.map((item) => item.name)).toEqual(['good.png', 'another.png']);
    expect(report.skipped.map((entry) => [entry.name, entry.reason])).toEqual([
      ['notes.png', 'it is not a PNG, JPEG, WebP or GIF image'],
      ['empty.png', 'it is empty'],
      ['huge.png', 'it is larger than 20 MB'],
      ['gone.png', 'it could not be read or copied'],
      ['a-folder', 'it is not a file'],
    ]);
    expect(store.getSnapshot().mediaLibrary).toHaveLength(2);
    // Only the two good images were written.
    expect((await readdir(mediaDirectory)).toSorted()).toEqual([`${ID_1}.png`, `${ID_2}.png`]);
  });

  it('does nothing when the operator cancels the dialog', async () => {
    const { store, service } = setup([]);
    expect(await service.importImages()).toEqual({ ok: true });
    expect(store.getSnapshot().mediaLibrary).toEqual([]);
    expect(saves).toBe(0);
  });

  it('reports the reasons when nothing could be added, and changes nothing', async () => {
    const source = await usbFile('notes.png', 'just some text');
    const { store, service } = setup([source]);
    const result = await service.importImages();
    expect(result).toEqual({
      ok: false,
      error: 'No images were added. notes.png (it is not a PNG, JPEG, WebP or GIF image)',
    });
    expect(store.getSnapshot().mediaLibrary).toEqual([]);
  });

  it('warns about the ones it skipped when it added others', async () => {
    const good = await usbFile('good.png', pngBytes(10, 10));
    const bad = await usbFile('bad.png', 'nope');
    const { store, service } = setup([good, bad]);
    expect(await service.importImages()).toEqual({ ok: true });
    const notice = store.getSnapshot().notices.find((n) => n.id === NOTICE_IMPORT_SKIPPED);
    expect(notice?.level).toBe('warning');
    expect(notice?.message).toMatch(/1 image\(s\) added\. Not added: bad\.png/);
  });

  it('shows the first image added when no Single Image is chosen yet, and leaves a choice alone', async () => {
    const first = await usbFile('first.png', pngBytes(10, 10));
    const second = await usbFile('second.png', pngBytes(10, 10));
    const { store, service } = setup([first, second]);
    await service.importImages();
    expect(store.getSnapshot().singleImage.imageId).toBe(ID_1);

    // A later import does not change what is already chosen.
    store.dispatchMedia({ type: 'selectSingleImage', mediaId: ID_2 });
    const third = await usbFile('third.png', pngBytes(10, 10));
    const again = await service.importFiles([third]);
    expect(again.added).toHaveLength(1);
    expect(store.getSnapshot().singleImage.imageId).toBe(ID_2);
  });
});

describe('deleting and reading', () => {
  it('deleteFile removes the stored file, and a file that is already gone is fine', async () => {
    const { store, service } = setup();
    await service.importFiles([await usbFile('a.png', pngBytes(10, 10))]);
    const item = store.getSnapshot().mediaLibrary[0];
    if (!item) throw new Error('no image');

    await service.deleteFile(item);
    expect(await readdir(mediaDirectory)).toEqual([]);
    await expect(service.deleteFile(item)).resolves.toBeUndefined();
  });

  it('readImage only serves images that are in the library', async () => {
    const { service } = setup();
    await service.importFiles([await usbFile('a.png', pngBytes(10, 10))]);
    expect(await service.readImage(ID_2)).toBeNull(); // valid id, not in the library
    expect(await service.readImage('../../etc/passwd')).toBeNull();
    expect(await service.readImage('')).toBeNull();
    expect(await service.readImage(ID_1)).not.toBeNull();
  });

  it('reads nothing for a library entry whose file has gone missing', async () => {
    const { store, service } = setup();
    await service.importFiles([await usbFile('a.png', pngBytes(10, 10))]);
    await rm(mediaDirectory, { recursive: true, force: true });
    expect(store.getSnapshot().mediaLibrary).toHaveLength(1);
    expect(await service.readImage(ID_1)).toBeNull();
  });
});

describe('checking the files at startup', () => {
  it('reports library images whose file is missing', async () => {
    const { store, service } = setup();
    await service.importFiles([
      await usbFile('kept.png', pngBytes(10, 10)),
      await usbFile('lost.png', pngBytes(10, 10)),
    ]);
    await rm(path.join(mediaDirectory, `${ID_2}.png`));

    await service.checkFiles();

    const notice = store.getSnapshot().notices.find((n) => n.id === NOTICE_MISSING_FILES);
    expect(notice?.level).toBe('warning');
    expect(notice?.message).toMatch(/1 image\(s\) are missing from the media folder: lost\.png/);
  });

  it('says nothing when every file is there', async () => {
    const { store, service } = setup();
    await service.importFiles([await usbFile('a.png', pngBytes(10, 10))]);
    await service.checkFiles();
    expect(store.getSnapshot().notices).toEqual([]);
  });
});

describe('the bingo-media:// protocol', () => {
  async function withImage() {
    const { service } = setup();
    const png = pngBytes(10, 10);
    await service.importFiles([await usbFile('a.png', png)]);
    return { service, png };
  }

  it('serves a library image with its content type', async () => {
    const { service, png } = await withImage();
    expect(await answerMediaRequest(service, `bingo-media://${ID_1}`)).toEqual({
      status: 200,
      mimeType: 'image/png',
      data: png,
    });
    expect((await answerMediaRequest(service, `bingo-media://${ID_1}/`)).status).toBe(200);
  });

  it('answers 404 for an image that is not in the library, or whose file is missing', async () => {
    const { service } = await withImage();
    expect((await answerMediaRequest(service, `bingo-media://${ID_2}`)).status).toBe(404);
    await rm(mediaDirectory, { recursive: true, force: true });
    expect((await answerMediaRequest(service, `bingo-media://${ID_1}`)).status).toBe(404);
  });

  it.each([
    ['a path after the id', `bingo-media://${ID_1}/extra`],
    ['a parent-folder path', `bingo-media://${ID_1}/../../secret.png`],
    ['a path instead of an id', 'bingo-media://../../etc/passwd'],
    ['an encoded traversal', `bingo-media://${ID_1}/%2e%2e%2f%2e%2e%2fsecret`],
    ['a query', `bingo-media://${ID_1}?x=1`],
    ['a fragment', `bingo-media://${ID_1}#x`],
    ['a file path as the id', 'bingo-media://C:/Windows/win.ini'],
    ['an id with a file extension', `bingo-media://${ID_1}.png`],
    ['another scheme', `file:///${ID_1}`],
    ['an http address', `http://example.com/${ID_1}`],
    ['nonsense', 'not a url'],
  ])('refuses %s', async (_name, url) => {
    const { service } = await withImage();
    const answer = await answerMediaRequest(service, url);
    expect(answer.status === 400 || answer.status === 404, `${url} -> ${answer.status}`).toBe(true);
    expect(answer.data).toBeUndefined();
  });
});
