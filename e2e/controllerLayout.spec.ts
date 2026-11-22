/**
 * Controller layout at the logical (CSS pixel) sizes a Windows laptop actually gives the app
 * (design doc §4.1: test logical width, not physical resolution), measured in the real app.
 *
 *   1024x640   small / cramped windows
 *   1280x720   1920x1080 at 150% scaling
 *   1280x800   a 16:10 laptop at 100%
 *   1366x768   1366x768 at 100%
 *   1536x864   1920x1080 at 125% scaling
 *
 * Plus the cases that broke earlier layouts (PR #55 review):
 *   910x480    1366x768 at 150% with Windows chrome: a short window, so every row above the grid counts
 *   1101..1160 x 700   either side of the one-/two-column breakpoint (the two-column layout needs 1120 px)
 *
 * Set BINGO_SCREENSHOT_DIR to a folder to keep a screenshot of every case for review.
 */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  createUserDataDir,
  horizontalOverflow,
  launchApp,
  removeUserDataDir,
  resizeController,
  tapBall,
  verticalOverflow,
} from './appHarness';

export const LAYOUT_SIZES = [
  { width: 1024, height: 640 },
  { width: 1280, height: 720 },
  { width: 1280, height: 800 },
  { width: 1366, height: 768 },
  { width: 1536, height: 864 },
  { width: 910, height: 480 },
  { width: 1101, height: 700 },
  { width: 1120, height: 700 },
  { width: 1128, height: 700 },
  { width: 1140, height: 700 },
  { width: 1141, height: 700 },
  { width: 1160, height: 700 },
] as const;

/** Design doc: 48 CSS px targets, never below 44; 48 from 1280 wide upwards. */
export function minimumBallSize(width: number): number {
  return width >= 1280 ? 48 : 44;
}

let userDataDir: string;

test.beforeEach(async () => {
  userDataDir = await createUserDataDir();
});

test.afterEach(async () => {
  await removeUserDataDir(userDataDir);
});

interface Rect {
  readonly width: number;
  readonly height: number;
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

async function rects(locator: Locator): Promise<Rect[]> {
  return locator.evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { width: r.width, height: r.height, left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    }),
  );
}

/** Calls six balls so the previous-five history is full: the widest the summary ever gets. */
async function fillHistory(controller: Page): Promise<void> {
  for (const label of ['B-3', 'I-17', 'N-33', 'G-48', 'O-61', 'B-9']) await tapBall(controller, label);
}

type BannerState = 'idle' | 'banner up';

/** Sizes for the top-bar scenarios below: the tightest case (150%), a small laptop, and a typical one. */
const SCENARIO_SIZES = [
  { width: 910, height: 480 },
  { width: 1024, height: 640 },
  { width: 1280, height: 720 },
] as const;

/** A realistic worst case for a projector's Windows monitor name. */
const LONG_MONITOR_NAME = 'Epson EB-PU1008W Projector (Main Hall, Stage Left)';
/** How the app labels it: the monitor name plus its physical resolution. */
const LONG_DISPLAY_LABEL = `${LONG_MONITOR_NAME} — 1920×1080`;

/** Raise the BINGO banner if asked, keep a picture, then assert the whole layout fits and is touchable. */
async function expectLayoutFits(
  controller: Page,
  size: { readonly width: number; readonly height: number },
  state: BannerState,
  pictureName: string,
): Promise<void> {
  const { width, height } = size;
  if (state === 'banner up') await controller.getByRole('button', { name: 'BINGO CALLED' }).click();
  await controller.waitForTimeout(200);

  const picture = await controller.screenshot();
  const fileName = `${pictureName}-${state.replace(' ', '-')}.png`;
  await test.info().attach(fileName, { body: picture, contentType: 'image/png' });
  // Set BINGO_SCREENSHOT_DIR to keep the pictures (passing tests do not retain attachments).
  const keepIn = process.env['BINGO_SCREENSHOT_DIR'];
  if (keepIn) await writeFile(path.join(keepIn, fileName), picture);

  // The top bar is one row. A second row is what pushed the grid out of short windows (PR #55 review).
  const header = await rects(controller.locator('header'));
  expect(header[0]?.height ?? 0, 'top bar must stay a single row').toBeLessThanOrEqual(56);

  // Nothing scrolls: the page, and the grid itself.
  expect(await horizontalOverflow(controller), 'horizontal overflow').toBe(0);
  expect(await verticalOverflow(controller), 'vertical overflow').toBe(0);
  const gridScroll = await controller.getByLabel('Bingo balls').evaluate((el) => ({
    over: el.scrollHeight - el.clientHeight,
    overX: el.scrollWidth - el.clientWidth,
  }));
  expect(gridScroll, 'the grid must not scroll internally').toEqual({ over: 0, overX: 0 });

  // All 75 balls are on screen and big enough to touch.
  const balls = await rects(controller.getByRole('group').getByRole('button'));
  expect(balls).toHaveLength(75);
  const minimum = minimumBallSize(width);
  for (const [index, ball] of balls.entries()) {
    expect(ball.width, `ball ${index + 1} width`).toBeGreaterThanOrEqual(minimum);
    expect(ball.height, `ball ${index + 1} height`).toBeGreaterThanOrEqual(minimum);
    expect(ball.left, `ball ${index + 1} left`).toBeGreaterThanOrEqual(0);
    expect(ball.top, `ball ${index + 1} top`).toBeGreaterThanOrEqual(0);
    expect(ball.right, `ball ${index + 1} right`).toBeLessThanOrEqual(width);
    expect(ball.bottom, `ball ${index + 1} bottom`).toBeLessThanOrEqual(height);
  }

  // Every other control is touchable too: tabs, top bar, BINGO and New Game (never below 44).
  const controls = await rects(controller.locator('button:not([aria-pressed]), select'));
  expect(controls.length, 'tabs, top bar buttons, BINGO and New Game').toBeGreaterThanOrEqual(8);
  for (const [index, control] of controls.entries()) {
    expect(control.height, `control ${index} height`).toBeGreaterThanOrEqual(44);
    expect(control.width, `control ${index} width`).toBeGreaterThanOrEqual(44);
    expect(control.right, `control ${index} right edge`).toBeLessThanOrEqual(width);
    expect(control.bottom, `control ${index} bottom edge`).toBeLessThanOrEqual(height);
  }
  // Where the layout hides "BINGO banner enabled" to save a row, it must stay readable to a screen reader.
  if (state === 'banner up') await expect(controller.getByText('BINGO banner enabled')).toHaveCount(1);

  // The four mode tabs are all on screen.
  await expect(controller.getByRole('tab')).toHaveCount(4);
}

for (const size of LAYOUT_SIZES) {
  for (const state of ['idle', 'banner up'] as const) {
    test(`Controller layout at ${size.width}x${size.height}, BINGO banner ${state}`, async () => {
      const { app, controller } = await launchApp(userDataDir);
      await resizeController(app, controller, size.width, size.height);
      await fillHistory(controller);
      await expectLayoutFits(controller, size, state, `controller-${size.width}x${size.height}`);
      await app.close();
    });
  }
}

// The top bar changes with what the operator is doing. These two states wrapped it onto a second row
// and pushed the grid out of a 910x480 window (PR #55 review), so they are checked at several sizes.
for (const size of SCENARIO_SIZES) {
  for (const state of ['idle', 'banner up'] as const) {
    test(`projecting on a display with a long name at ${size.width}x${size.height}, banner ${state}`, async () => {
      const { app, controller } = await launchApp(userDataDir);
      await resizeController(app, controller, size.width, size.height);
      await fillHistory(controller);

      // Projecting needs a real second monitor, which a test machine may not have, and would put a
      // fullscreen window on the developer's screen. So report a synthetic projector alongside the real
      // display (no window is opened), which gives the Controller its real selector with the long name in
      // it on any machine, then put the long text into the status pill, which only Project would set.
      await app.evaluate(({ BrowserWindow, screen }, name) => {
        const own = screen.getDisplayMatching(BrowserWindow.getAllWindows()[0]!.getBounds());
        const projector = {
          id: 910001,
          label: name,
          bounds: { x: own.bounds.x + own.bounds.width, y: own.bounds.y, width: 1920, height: 1080 },
          scaleFactor: 1,
          internal: false,
        } as unknown as typeof own;
        screen.getAllDisplays = () => [own, projector];
      }, LONG_MONITOR_NAME);
      await controller.getByRole('button', { name: 'Refresh displays' }).click();
      // Fail loudly if the selector is missing: without it this would quietly test the single-display hint.
      const selector = controller.getByRole('combobox');
      await expect(selector).toBeVisible();
      await expect(selector.locator('option')).toHaveText(LONG_DISPLAY_LABEL);
      await expect(controller.getByRole('button', { name: 'Project', exact: true })).toBeVisible();
      await controller.getByRole('status').evaluate((el, label) => {
        el.textContent = `Projecting on ${label}`;
        el.setAttribute('data-kind', 'projecting');
      }, LONG_DISPLAY_LABEL);

      await expectLayoutFits(
        controller,
        size,
        state,
        `controller-projecting-long-label-${size.width}x${size.height}`,
      );
      await app.close();
    });

    test(`single-display setup at ${size.width}x${size.height}, banner ${state}`, async () => {
      const { app, controller } = await launchApp(userDataDir);
      await resizeController(app, controller, size.width, size.height);
      await fillHistory(controller);

      // Report only the display the Controller is on, as a laptop with nothing plugged in would, then refresh.
      await app.evaluate(({ BrowserWindow, screen }) => {
        const own = screen.getDisplayMatching(BrowserWindow.getAllWindows()[0]!.getBounds());
        screen.getAllDisplays = () => [own];
      });
      await controller.getByRole('button', { name: 'Refresh displays' }).click();
      const hint = controller.getByText(/No second display/);
      await expect(hint).toBeVisible();
      await expect(controller.getByRole('button', { name: 'Project', exact: true })).toHaveCount(0);

      // The instructions stay fully readable: the hint is not cut off by its line clamp.
      const clipped = await hint.evaluate((el) => el.scrollHeight - el.clientHeight);
      expect(clipped, 'the single-display hint must not be clipped').toBeLessThanOrEqual(1);
      await expect(hint).toContainText('Win+P');
      await expect(controller.getByRole('button', { name: 'Preview' })).toBeVisible();

      await expectLayoutFits(
        controller,
        size,
        state,
        `controller-single-display-${size.width}x${size.height}`,
      );
      await app.close();
    });
  }
}
