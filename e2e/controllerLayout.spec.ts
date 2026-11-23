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
  { width: 1439, height: 800 },
  { width: 1440, height: 800 },
  { width: 1440, height: 720 },
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

/**
 * Ask the app to re-read the connected displays, as Windows would tell it about a newly connected projector. The
 * tests below fake the display list, so they trigger the re-read directly (there is no button for it any more).
 */
async function refreshDisplays(controller: Page): Promise<void> {
  await controller.evaluate(() =>
    (globalThis as unknown as { bingo: { listDisplays(): Promise<unknown> } }).bingo.listDisplays(),
  );
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

/**
 * Where things are, by size. From 1141 px: BINGO CALLED tops the side column over the Current Call widget, which
 * ends level with the ball board; the projector controls are one widget in the top bar. From 1440 x 780 the left
 * rail holds New Game and the pattern widget (tappable cells); in a wider-but-shorter or narrower window New Game
 * is in the top bar and the pattern widget is a strip above the board. Below 1141 the compact layout keeps New
 * Game in the top bar and a small Pattern card.
 */
async function expectArrangement(
  controller: Page,
  size: { readonly width: number; readonly height: number },
): Promise<void> {
  const { width, height } = size;
  const rail = width >= 1440 && height >= 780;
  const [newGame] = await rects(controller.getByRole('button', { name: 'New Game', exact: true }));
  const [status] = await rects(controller.getByRole('status'));
  expect(status?.top ?? 99, 'projector status is in the top bar').toBeLessThan(70);

  if (width < 1141) {
    expect(newGame?.top ?? 99, 'New Game is in the top bar').toBeLessThan(70);
    await expect(controller.getByRole('button', { name: /^Pattern/ })).toBeVisible();
    return;
  }

  const [board] = await rects(controller.getByLabel('Bingo balls'));
  const [pattern] = await rects(controller.getByRole('region', { name: 'Pattern' }));
  const [summary] = await rects(controller.getByLabel('Call summary'));
  const [bingo] = await rects(controller.getByRole('button', { name: /BINGO CALLED|Dismiss BINGO/ }));
  const [first] = await rects(controller.getByRole('button', { name: /^B-1,/ }));

  if (rail) {
    expect(newGame?.right ?? 0, 'New Game is in the left rail').toBeLessThanOrEqual(board?.left ?? 0);
    expect(newGame?.top ?? 0, 'New Game is below the top bar').toBeGreaterThan(70);
    expect(pattern?.right ?? 0, 'the pattern widget is in the left rail').toBeLessThanOrEqual(
      board?.left ?? 0,
    );
    const cells = await rects(controller.getByRole('button', { name: /^Row \d, column \d$/ }));
    expect(cells, 'the rail has the 25 tappable cells').toHaveLength(25);
    for (const [index, cell] of cells.entries()) {
      expect(cell.width, `pattern cell ${index} width`).toBeGreaterThanOrEqual(44);
      expect(cell.height, `pattern cell ${index} height`).toBeGreaterThanOrEqual(44);
    }
  } else {
    expect(newGame?.top ?? 99, 'New Game is in the top bar').toBeLessThan(70);
    expect(pattern?.bottom ?? 99, 'the pattern strip is above the board').toBeLessThanOrEqual(
      (board?.top ?? 0) + 1,
    );
    expect(pattern?.left ?? 99, 'the pattern strip is over the board column').toBeLessThanOrEqual(
      (board?.left ?? 0) + 1,
    );
  }

  expect(bingo?.bottom ?? 0, 'BINGO CALLED is above the Current Call widget').toBeLessThanOrEqual(
    (summary?.top ?? 0) + 1,
  );
  // The side column ends level with the board's bottom: the Current Call widget stretches down to it.
  expect(
    Math.abs((summary?.bottom ?? 0) - (board?.bottom ?? 99)),
    'call widget ends level with the board',
  ).toBeLessThanOrEqual(1);
  // BINGO is level with the top of the content beside it (the rail, or the strip, or the board), or one status
  // line lower while the banner is up ("BINGO banner enabled").
  const contentTop = rail ? (board?.top ?? 0) : (pattern?.top ?? 0);
  const drop = (bingo?.top ?? 0) - contentTop;
  expect(drop, 'BINGO sits at the top of the side column').toBeGreaterThanOrEqual(-1);
  expect(drop, 'BINGO sits at the top of the side column').toBeLessThanOrEqual(32);
  // The board starts at the top of its area, not centered in spare height.
  expect((first?.top ?? 99) - (board?.top ?? 0), 'first row is at the top of the board').toBeLessThanOrEqual(
    16,
  );
}

/** Keep a picture, then assert the whole layout fits and is touchable. (The banner is raised by the caller.) */
async function expectLayoutFits(
  controller: Page,
  size: { readonly width: number; readonly height: number },
  state: BannerState,
  pictureName: string,
): Promise<void> {
  const { width, height } = size;
  await controller.waitForTimeout(200);

  const picture = await controller.screenshot();
  const fileName = `${pictureName}-${state.replace(' ', '-')}.png`;
  await test.info().attach(fileName, { body: picture, contentType: 'image/png' });
  // Set BINGO_SCREENSHOT_DIR to keep the pictures (passing tests do not retain attachments).
  const keepIn = process.env['BINGO_SCREENSHOT_DIR'];
  if (keepIn) await writeFile(path.join(keepIn, fileName), picture);

  // The top bar is one row. A second row is what pushed the grid out of short windows (PR #55 review).
  // From 1141 px the projector controls sit in a bordered widget (58 px tall); a wrapped bar is over 100.
  const header = await rects(controller.locator('header'));
  expect(header[0]?.height ?? 0, 'top bar must stay a single row').toBeLessThanOrEqual(64);

  // Nothing scrolls: the page, and the grid itself.
  expect(await horizontalOverflow(controller), 'horizontal overflow').toBe(0);
  expect(await verticalOverflow(controller), 'vertical overflow').toBe(0);
  const gridScroll = await controller.getByLabel('Bingo balls').evaluate((el) => ({
    over: el.scrollHeight - el.clientHeight,
    overX: el.scrollWidth - el.clientWidth,
  }));
  expect(gridScroll, 'the grid must not scroll internally').toEqual({ over: 0, overX: 0 });

  // All 75 balls are on screen and big enough to touch.
  const balls = await rects(controller.getByRole('button', { name: /^[BINGO]-\d+,/ }));
  expect(balls).toHaveLength(75);
  // The five row letters are buttons too (tap one to black the row out), and as touchable as a ball.
  const letters = await rects(controller.getByRole('button', { name: /^Black out [BINGO] row$/ }));
  expect(letters).toHaveLength(5);
  for (const [index, letter] of letters.entries()) {
    expect(letter.width, `row letter ${index} width`).toBeGreaterThanOrEqual(minimumBallSize(width));
    expect(letter.height, `row letter ${index} height`).toBeGreaterThanOrEqual(minimumBallSize(width));
    expect(letter.right, `row letter ${index} right`).toBeLessThanOrEqual(width);
    expect(letter.bottom, `row letter ${index} bottom`).toBeLessThanOrEqual(height);
  }
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
  await expectArrangement(controller, size);

  // Where the layout hides "BINGO banner enabled" to save a row, it must stay readable to a screen reader.
  if (state === 'banner up') await expect(controller.getByText('BINGO banner enabled')).toHaveCount(1);

  // The four mode tabs are all on screen.
  await expect(controller.getByRole('tab')).toHaveCount(4);
}

const STATES = ['idle', 'banner up'] as const;

/** Raise the BINGO banner once, before the sizes are stepped through (the same window is reused for all of them). */
async function raiseBannerIf(controller: Page, state: BannerState): Promise<void> {
  if (state === 'banner up') await controller.getByRole('button', { name: 'BINGO CALLED' }).click();
}

// One Electron launch per banner state: the same Controller window is resized through every size, which
// keeps the full suite under a minute. Each size is its own step, so a failure names the size.
for (const state of STATES) {
  test(`Controller layout at every size, BINGO banner ${state}`, async () => {
    const { app, controller } = await launchApp(userDataDir);
    await fillHistory(controller);
    await raiseBannerIf(controller, state);

    for (const size of LAYOUT_SIZES) {
      await test.step(`${size.width}x${size.height}`, async () => {
        await resizeController(app, controller, size.width, size.height);
        await expectLayoutFits(controller, size, state, `controller-${size.width}x${size.height}`);
      });
    }
    await app.close();
  });
}

// The Patterns screen replaces the ball grid, so it gets its own checks: the editor fits without scrolling at
// every size, and everything on it (and the controls that stay) is touchable. The game screen, with the
// Pattern card on it, is covered by every test above.
test('Controller Patterns screen at every size', async () => {
  const { app, controller } = await launchApp(userDataDir);
  await fillHistory(controller);
  await controller.getByRole('button', { name: /^(Edit patterns…|Pattern)/ }).click();
  const view = controller.getByRole('region', { name: 'Patterns' });
  await expect(view).toBeVisible();

  for (const size of LAYOUT_SIZES) {
    await test.step(`${size.width}x${size.height}`, async () => {
      const { width, height } = size;
      await resizeController(app, controller, width, height);
      await controller.waitForTimeout(200);
      const picture = await controller.screenshot();
      const keepIn = process.env['BINGO_SCREENSHOT_DIR'];
      if (keepIn) await writeFile(path.join(keepIn, `controller-patterns-${width}x${height}.png`), picture);

      const header = await rects(controller.locator('header'));
      expect(header[0]?.height ?? 0, 'top bar must stay a single row').toBeLessThanOrEqual(64);
      expect(await horizontalOverflow(controller), 'horizontal overflow').toBe(0);
      expect(await verticalOverflow(controller), 'vertical overflow').toBe(0);

      // The editor and its controls never scroll; only the library list may.
      const [box] = await rects(view);
      expect(box?.right, 'view right edge').toBeLessThanOrEqual(width);
      expect(box?.bottom, 'view bottom edge').toBeLessThanOrEqual(height);
      const editor = await rects(view.locator('input, button[aria-pressed]'));
      const inside = editor.every(
        (control) => control.bottom <= (box?.bottom ?? 0) + 0.5 && control.right <= (box?.right ?? 0) + 0.5,
      );
      expect(inside, 'the title and all 25 cells are inside the view').toBe(true);

      const cells = await rects(view.getByRole('button', { name: /^Row \d, column \d$/ }));
      expect(cells).toHaveLength(25);
      for (const [index, cell] of cells.entries()) {
        expect(cell.width, `cell ${index} width`).toBeGreaterThanOrEqual(44);
        expect(cell.height, `cell ${index} height`).toBeGreaterThanOrEqual(44);
      }

      // Everything else tappable is touch-sized, inside the window, and the BINGO control is still there.
      await expect(controller.getByRole('button', { name: 'BINGO CALLED' })).toBeVisible();
      const controls = await rects(controller.locator('button:not([aria-pressed]):visible, select:visible'));
      for (const [index, control] of controls.entries()) {
        expect(control.height, `control ${index} height`).toBeGreaterThanOrEqual(44);
        expect(control.width, `control ${index} width`).toBeGreaterThanOrEqual(44);
        expect(control.right, `control ${index} right edge`).toBeLessThanOrEqual(width);
      }
      // The first and last saved pattern can be reached (the list scrolls on its own if it must).
      await expect(view.getByRole('button', { name: 'Four Corners' })).toBeVisible();
    });
  }

  // And back: the game is exactly as it was left.
  await controller.getByRole('button', { name: /Back to game/ }).click();
  await expect(controller.getByTestId('called-count')).toHaveText('Called: 6 of 75');
  await app.close();
});

// The top bar changes with what the operator is doing. These two states wrapped it onto a second row
// and pushed the grid out of a 910x480 window (PR #55 review), so they are checked at several sizes.
for (const state of STATES) {
  test(`projecting on a display with a long name at the tight sizes, banner ${state}`, async () => {
    const { app, controller } = await launchApp(userDataDir);
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
    await refreshDisplays(controller);
    // Fail loudly if the selector is missing: without it this would quietly test the single-display hint.
    const selector = controller.getByLabel('Presentation display');
    await expect(selector).toBeVisible();
    await expect(selector.locator('option')).toHaveText(LONG_DISPLAY_LABEL);
    await expect(controller.getByRole('button', { name: 'Project', exact: true })).toBeVisible();
    await controller.getByRole('status').evaluate((el, label) => {
      el.textContent = `Projecting on ${label}`;
      el.setAttribute('data-kind', 'projecting');
    }, LONG_DISPLAY_LABEL);
    await raiseBannerIf(controller, state);

    for (const size of SCENARIO_SIZES) {
      await test.step(`${size.width}x${size.height}`, async () => {
        await resizeController(app, controller, size.width, size.height);
        await expectLayoutFits(
          controller,
          size,
          state,
          `controller-projecting-long-label-${size.width}x${size.height}`,
        );
      });
    }
    await app.close();
  });

  test(`single-display setup at the tight sizes, banner ${state}`, async () => {
    const { app, controller } = await launchApp(userDataDir);
    await fillHistory(controller);

    // Report only the display the Controller is on, as a laptop with nothing plugged in would, then refresh.
    await app.evaluate(({ BrowserWindow, screen }) => {
      const own = screen.getDisplayMatching(BrowserWindow.getAllWindows()[0]!.getBounds());
      screen.getAllDisplays = () => [own];
    });
    await refreshDisplays(controller);
    const hint = controller.getByText(/No second display/);
    await expect(hint).toBeVisible();
    await expect(controller.getByRole('button', { name: 'Project', exact: true })).toHaveCount(0);
    await raiseBannerIf(controller, state);

    for (const size of SCENARIO_SIZES) {
      await test.step(`${size.width}x${size.height}`, async () => {
        await resizeController(app, controller, size.width, size.height);
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
      });
    }
    await app.close();
  });
}
