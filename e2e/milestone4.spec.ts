/**
 * Milestone 4 end-to-end checks, added slice by slice as M4 lands.
 *
 * Slice 1: the media library and Single Image mode. The native file dialog cannot be driven, so the tests replace
 * `dialog.showOpenDialog` in the main process with one that returns a file, exactly as if the operator had chosen it.
 */
import { deflateSync, crc32 } from 'node:zlib';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, test, type ElectronApplication, type Locator, type Page } from '@playwright/test';
import { createUserDataDir, launchApp, removeUserDataDir, waitForPresentationWindow } from './appHarness';

let userDataDir: string;
let usbDir: string;

test.beforeEach(async () => {
  userDataDir = await createUserDataDir();
  usbDir = path.join(os.tmpdir(), `bingo-e2e-usb-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
  await mkdir(usbDir, { recursive: true });
});

test.afterEach(async () => {
  await removeUserDataDir(userDataDir);
  await rm(usbDir, { recursive: true, force: true });
});

/** One PNG chunk: length, type, data and checksum. */
function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, checksum]);
}

/** A real, decodable PNG of one solid colour (so the page can actually load and measure it). */
function solidPng(width: number, height: number, rgb: readonly [number, number, number]): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8); // 8-bit RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: width }, () => rgb).flat())]);
  const pixels = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(pixels)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Make the next "Add images…" dialog return these files, as if the operator had picked them. */
async function chooseFilesInDialog(app: ElectronApplication, files: readonly string[]): Promise<void> {
  await app.evaluate(({ dialog }, paths) => {
    dialog.showOpenDialog = (async () => ({
      canceled: false,
      filePaths: paths,
    })) as unknown as typeof dialog.showOpenDialog;
  }, files);
}

const loadedWidth = (image: Locator): Promise<number> =>
  image.evaluate((el) => (el as unknown as { naturalWidth: number }).naturalWidth);

async function openSingleImageTab(controller: Page): Promise<Locator> {
  await controller.getByRole('tab', { name: 'Single Image' }).click();
  return controller.getByRole('region', { name: 'Single image' });
}

test('an imported image is kept: it shows on the projector after the original is deleted and the app restarted', async () => {
  const source = path.join(usbDir, 'Legion Sponsors.png');
  await writeFile(source, solidPng(64, 36, [200, 30, 30]));

  const first = await launchApp(userDataDir);
  await chooseFilesInDialog(first.app, [source]);
  const panel = await openSingleImageTab(first.controller);
  await expect(panel.getByText(/There are no images yet/)).toBeVisible();

  await panel.getByRole('button', { name: 'Add images…' }).click();
  const preview = panel.getByRole('img', { name: 'Legion Sponsors.png' });
  await expect(preview).toBeVisible();
  expect(await loadedWidth(preview)).toBe(64);
  await expect(panel).toContainText('Legion Sponsors.png · 64 × 36');

  // The projector shows it, full screen, with no controls.
  await first.controller.getByRole('button', { name: 'Preview' }).click();
  const projector = await waitForPresentationWindow(first.app);
  const shown = projector.getByRole('img', { name: 'Legion Sponsors.png' });
  await expect(shown).toBeVisible();
  expect(await loadedWidth(shown)).toBe(64);
  await expect(projector.getByRole('button')).toHaveCount(0);

  // The USB stick is removed, and the app is restarted.
  await rm(source);
  await first.app.close();

  const second = await launchApp(userDataDir);
  const secondPanel = second.controller.getByRole('region', { name: 'Single image' });
  const restored = secondPanel.getByRole('img', { name: 'Legion Sponsors.png' });
  await expect(restored).toBeVisible();
  expect(await loadedWidth(restored)).toBe(64);
  await second.controller.getByRole('button', { name: 'Preview' }).click();
  const secondProjector = await waitForPresentationWindow(second.app);
  const secondShown = secondProjector.getByRole('img', { name: 'Legion Sponsors.png' });
  await expect(secondShown).toBeVisible();
  expect(await loadedWidth(secondShown)).toBe(64);
  await second.app.close();
});

test('choosing, Fit / Fill and removing an image reach the projector; the game and the pattern are untouched', async () => {
  const red = path.join(usbDir, 'Red.png');
  const blue = path.join(usbDir, 'Blue.png');
  await writeFile(red, solidPng(48, 27, [200, 30, 30]));
  await writeFile(blue, solidPng(48, 27, [30, 30, 200]));

  const { app, controller } = await launchApp(userDataDir);
  await controller.getByRole('button', { name: 'B-3, not called' }).click();
  await controller.getByRole('button', { name: 'Preview' }).click();
  const projector = await waitForPresentationWindow(app);

  await chooseFilesInDialog(app, [red, blue]);
  const panel = await openSingleImageTab(controller);
  await panel.getByRole('button', { name: 'Add images…' }).click();
  await expect(panel).toContainText('Image library · 2 images');

  // The first image added is shown; tapping the other one switches the projector to it.
  const stage = projector.getByRole('region', { name: 'Single image' });
  await expect(stage.getByRole('img', { name: 'Red.png' })).toBeVisible();
  await panel.getByRole('button', { name: /^Blue\.png/ }).click();
  await expect(stage.getByRole('img', { name: 'Blue.png' })).toBeVisible();

  // Fit by default; Fill covers the screen.
  await expect(stage).toHaveAttribute('data-fit', 'fit');
  await panel.getByRole('button', { name: 'Fill' }).click();
  await expect(stage).toHaveAttribute('data-fit', 'fill');

  // The Single Image tab has no countdown, and the Controller's game controls are not on this tab.
  await expect(projector.getByText(/Time to Play/i)).toHaveCount(0);
  await expect(controller.getByRole('button', { name: 'BINGO CALLED' })).toHaveCount(0);

  // Remove the image on the projector: it asks first, then the projector shows its plain "no image" screen.
  await panel.getByRole('button', { name: 'Remove this image…' }).click();
  await controller.getByRole('dialog').getByRole('button', { name: 'Remove Image' }).click();
  await expect(projector.getByText('No image selected')).toBeVisible();
  await expect(panel).toContainText('Image library · 1 image');

  // Back to the board: the call made earlier is still there.
  await controller.getByRole('tab', { name: 'Game Board' }).click();
  await expect(controller.getByTestId('called-count')).toHaveText('Called: 1 of 75');
  await expect(controller.getByRole('button', { name: 'BINGO CALLED' })).toBeVisible();
  await app.close();
});

test('files that are not images are refused with the reason, and the library is unchanged', async () => {
  const notAnImage = path.join(usbDir, 'notes.png');
  await writeFile(notAnImage, 'this is only text');

  const { app, controller } = await launchApp(userDataDir);
  await chooseFilesInDialog(app, [notAnImage]);
  const panel = await openSingleImageTab(controller);
  await panel.getByRole('button', { name: 'Add images…' }).click();
  await expect(
    controller.getByText(/No images were added\. notes\.png \(it is not a PNG, JPEG, WebP or GIF image\)/),
  ).toBeVisible();
  await expect(panel.getByText(/There are no images yet/)).toBeVisible();
  await app.close();
});

test('the offline policy still blocks every remote address and unknown images, while library images load', async () => {
  const source = path.join(usbDir, 'Logo.png');
  await writeFile(source, solidPng(16, 9, [10, 120, 10]));

  const { app, controller } = await launchApp(userDataDir);
  await chooseFilesInDialog(app, [source]);
  const panel = await openSingleImageTab(controller);
  await panel.getByRole('button', { name: 'Add images…' }).click();
  await controller.getByRole('button', { name: 'Preview' }).click();
  const projector = await waitForPresentationWindow(app);
  await expect(projector.getByRole('img', { name: 'Logo.png' })).toBeVisible();

  // Try to load pictures from inside the projector page: a remote one, and a library id that does not exist.
  const loads = (url: string) =>
    projector.evaluate(
      (address) =>
        new Promise<string>((resolve) => {
          // The Node type definitions have no DOM, so describe the one thing we use of an image element.
          type PictureElement = {
            addEventListener(type: string, listener: () => void): void;
            src: string;
          };
          const picture = new (globalThis as unknown as { Image: new () => PictureElement }).Image();
          picture.addEventListener('load', () => resolve('loaded'));
          picture.addEventListener('error', () => resolve('failed'));
          picture.src = address;
        }),
      url,
    );
  expect(await loads('https://example.com/logo.png')).toBe('failed');
  expect(await loads('bingo-media://00000000-0000-4000-8000-000000000000')).toBe('failed');
  // Remote network calls are refused too (the production CSP allows no connections at all).
  const remote = await projector.evaluate(() =>
    fetch('https://example.com/data.json').then(
      () => 'loaded',
      () => 'blocked',
    ),
  );
  expect(remote).toBe('blocked');
  await app.close();
});
