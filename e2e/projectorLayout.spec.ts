/**
 * Projector (Presentation) layout at the display areas it is shown on (design doc §4.2: "test common
 * 1920x1080, 1366x768, 1280x720 and 1024x768 display areas. No essential content should fall off screen").
 *
 * Measured in the real app through a Preview window resized to each area. For every size, in four
 * states (empty, mid-game, BINGO banner up, a pattern pushed to the projector) it asserts:
 *  - every element is fully inside the viewport and nothing scrolls
 *  - nothing overlaps: not the main regions, and not any two balls, letters or labels
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
  resizePresentation,
  tapBall,
  verticalOverflow,
  waitForPresentationWindow,
} from './appHarness';

export const PROJECTOR_SIZES = [
  { width: 1920, height: 1080 },
  { width: 1366, height: 768 },
  { width: 1280, height: 720 },
  { width: 1024, height: 768 },
] as const;

type GameState = 'empty' | 'mid-game' | 'banner up' | 'pattern shown';

interface Box {
  readonly name: string;
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

let userDataDir: string;

test.beforeEach(async () => {
  userDataDir = await createUserDataDir();
});

test.afterEach(async () => {
  await removeUserDataDir(userDataDir);
});

async function boxes(locator: Locator, name: string): Promise<Box[]> {
  const found = await locator.evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return {
        left: r.left,
        top: r.top,
        right: r.right,
        bottom: r.bottom,
        label: el.getAttribute('aria-label') ?? '',
      };
    }),
  );
  return found.map((box, index) => ({ ...box, name: `${name} ${box.label || index + 1}` }));
}

/** Two boxes overlap when they share more than a sliver of area (sub-pixel rounding is not an overlap). */
function overlap(a: Box, b: Box): boolean {
  const TOLERANCE = 0.5;
  return (
    a.left < b.right - TOLERANCE &&
    b.left < a.right - TOLERANCE &&
    a.top < b.bottom - TOLERANCE &&
    b.top < a.bottom - TOLERANCE
  );
}

function expectInside(all: readonly Box[], size: { width: number; height: number }): void {
  for (const box of all) {
    expect(box.left, `${box.name} left edge`).toBeGreaterThanOrEqual(0);
    expect(box.top, `${box.name} top edge`).toBeGreaterThanOrEqual(0);
    expect(box.right, `${box.name} right edge`).toBeLessThanOrEqual(size.width);
    expect(box.bottom, `${box.name} bottom edge`).toBeLessThanOrEqual(size.height);
  }
}

function expectNoOverlaps(all: readonly Box[], what: string): void {
  const clashes: string[] = [];
  for (let i = 0; i < all.length; i += 1) {
    for (let j = i + 1; j < all.length; j += 1) {
      const a = all[i];
      const b = all[j];
      if (a && b && overlap(a, b)) clashes.push(`${a.name} / ${b.name}`);
    }
  }
  expect(clashes, `${what} must not overlap`).toEqual([]);
}

async function measure(presentation: Page, size: { width: number; height: number }, state: GameState) {
  // Nothing scrolls (the window hides overflow, so a clipped element would otherwise go unnoticed).
  expect(await horizontalOverflow(presentation), 'horizontal overflow').toBe(0);
  expect(await verticalOverflow(presentation), 'vertical overflow').toBe(0);

  const banner = await boxes(presentation.getByRole('alert'), 'banner');
  expect(banner, 'banner shown only when raised').toHaveLength(state === 'banner up' ? 1 : 0);

  const callPanel = await boxes(presentation.getByLabel('Current call', { exact: true }), 'call display');
  const board = await boxes(presentation.getByLabel('Bingo board'), 'board');
  // The pattern is on the projector only after the operator pushes it.
  const pattern = await boxes(presentation.getByLabel('Winning pattern', { exact: true }), 'pattern');
  expect(pattern, 'pattern shown only when pushed').toHaveLength(state === 'pattern shown' ? 1 : 0);
  const regions = [...banner, ...callPanel, ...board, ...pattern];
  expect(callPanel).toHaveLength(1);
  expect(board).toHaveLength(1);

  const letters = await boxes(
    presentation.locator('[data-letter]').filter({ hasText: /^[BINGO]$/ }),
    'letter',
  );
  const cells = await boxes(presentation.locator('[data-testid^="board-ball-"]'), 'board ball');
  expect(letters).toHaveLength(5);
  expect(cells).toHaveLength(75);

  const callParts = [
    ...(await boxes(presentation.getByLabel('Current call', { exact: true }).getByRole('img'), 'call ball')),
    ...(await boxes(presentation.getByText('Ready for first call'), 'ready text')),
    ...(await boxes(presentation.getByRole('heading', { name: 'Previous' }), 'previous heading')),
  ];

  expectInside([...regions, ...letters, ...cells, ...callParts], size);
  expectNoOverlaps(regions, 'banner, call display, pattern and board');
  expectNoOverlaps([...letters, ...cells], 'board letters and balls');
  expectNoOverlaps(callParts, 'the call display contents');
  // Everything drawn in a region stays inside it.
  for (const part of callParts) {
    const panel = callPanel[0];
    expect(
      panel && part.left >= panel.left - 0.5 && part.right <= panel.right + 0.5,
      `${part.name} inside call display`,
    ).toBe(true);
    expect(
      panel && part.top >= panel.top - 0.5 && part.bottom <= panel.bottom + 0.5,
      `${part.name} inside call display (vertical)`,
    ).toBe(true);
  }
  const frame = board[0];
  for (const part of [...letters, ...cells]) {
    expect(
      frame && part.left >= frame.left - 0.5 && part.right <= frame.right + 0.5,
      `${part.name} inside the board`,
    ).toBe(true);
    expect(
      frame && part.top >= frame.top - 0.5 && part.bottom <= frame.bottom + 0.5,
      `${part.name} inside the board (vertical)`,
    ).toBe(true);
  }
  // The pushed pattern: its title and all 25 squares are inside its region and do not overlap.
  if (pattern[0]) {
    const title = await boxes(presentation.getByRole('heading', { name: 'Big L' }), 'pattern title');
    const squares = await boxes(presentation.locator('[data-testid^="pattern-cell-"]'), 'pattern square');
    expect(title).toHaveLength(1);
    expect(squares).toHaveLength(25);
    expectInside([...title, ...squares], size);
    expectNoOverlaps([...title, ...squares], 'the pattern title and squares');
    for (const part of [...title, ...squares]) {
      const region = pattern[0];
      expect(
        region &&
          part.left >= region.left - 0.5 &&
          part.right <= region.right + 0.5 &&
          part.top >= region.top - 0.5 &&
          part.bottom <= region.bottom + 0.5,
        `${part.name} inside the pattern region`,
      ).toBe(true);
    }
  }
  return { callPanel: callPanel[0], board: board[0], cells };
}

// One Electron launch per game state: the same Preview window is resized through every resolution, which
// keeps the full suite fast. Each resolution is its own step, so a failure names the size.
for (const state of ['empty', 'mid-game', 'banner up', 'pattern shown'] as const) {
  test(`projector layout at all four resolutions, ${state}`, async () => {
    const { app, controller } = await launchApp(userDataDir);
    if (state !== 'empty') {
      for (const label of ['B-3', 'I-17', 'N-33', 'G-48', 'O-61', 'B-9']) await tapBall(controller, label);
    }
    if (state === 'banner up') await controller.getByRole('button', { name: 'BINGO CALLED' }).click();
    if (state === 'pattern shown') {
      // Push Big L through the real bridge, as the Show on projector button does.
      await controller.evaluate(async () => {
        const api = (
          globalThis as unknown as {
            bingo: {
              selectPattern(id: string): Promise<unknown>;
              showPatternOnProjector(): Promise<unknown>;
            };
          }
        ).bingo;
        await api.selectPattern('seed-big-l');
        await api.showPatternOnProjector();
      });
    }
    await controller.getByRole('button', { name: 'Preview' }).click();
    const presentation = await waitForPresentationWindow(app);

    for (const size of PROJECTOR_SIZES) {
      await test.step(`${size.width}x${size.height}`, async () => {
        const actual = await resizePresentation(app, presentation, size.width, size.height);
        await presentation.waitForTimeout(300);

        const picture = await presentation.screenshot();
        const fileName = `projector-${size.width}x${size.height}-${state.replace(' ', '-')}.png`;
        await test.info().attach(fileName, { body: picture, contentType: 'image/png' });
        // Passing tests do not retain attachments, so BINGO_SCREENSHOT_DIR keeps the pictures.
        const keepIn = process.env['BINGO_SCREENSHOT_DIR'];
        if (keepIn) await writeFile(path.join(keepIn, fileName), picture);

        await measure(presentation, actual, state);
      });
    }
    await app.close();
  });
}
