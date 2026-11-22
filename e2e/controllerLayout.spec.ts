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

for (const { width, height } of LAYOUT_SIZES) {
  for (const state of ['idle', 'banner up'] as const) {
    test(`Controller layout at ${width}x${height}, BINGO banner ${state}`, async () => {
      const testInfo = test.info();
      const { app, controller } = await launchApp(userDataDir);
      await resizeController(app, controller, width, height);
      await fillHistory(controller);
      if (state === 'banner up') await controller.getByRole('button', { name: 'BINGO CALLED' }).click();
      await controller.waitForTimeout(200);

      const picture = await controller.screenshot();
      const fileName = `controller-${width}x${height}-${state.replace(' ', '-')}.png`;
      await testInfo.attach(fileName, { body: picture, contentType: 'image/png' });
      // Set BINGO_SCREENSHOT_DIR to keep the pictures (passing tests do not retain attachments).
      const keepIn = process.env['BINGO_SCREENSHOT_DIR'];
      if (keepIn) await writeFile(path.join(keepIn, fileName), picture);

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
      expect(controls.length, 'tabs, top bar buttons, BINGO and New Game').toBeGreaterThanOrEqual(10);
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

      await app.close();
    });
  }
}
