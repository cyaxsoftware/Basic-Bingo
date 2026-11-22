/**
 * Milestone 3 end-to-end checks, added card by card as M3 features land.
 *
 * The first test drives the real preload bridge from inside the Controller page; the second uses the pattern
 * widget and the real Preview window, as an operator would.
 */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import {
  createUserDataDir,
  launchApp,
  removeUserDataDir,
  resizeController,
  tapBall,
  waitForPresentationWindow,
} from './appHarness';

let userDataDir: string;

test.beforeEach(async () => {
  userDataDir = await createUserDataDir();
});

test.afterEach(async () => {
  await removeUserDataDir(userDataDir);
});

const CENTER = 12;
/** A plus sign: the middle row and the middle column. The center is on because the shape includes it. */
const PLUS = Array.from({ length: 25 }, (_, index) => index % 5 === 2 || Math.floor(index / 5) === 2);

interface PatternSnapshot {
  readonly patternLibrary: ReadonlyArray<{ id: string; title: string; cells: boolean[] }>;
  readonly activePattern: {
    sourcePatternId: string | null;
    title: string;
    cells: boolean[];
    editedFromLibrary: boolean;
  };
}

const snapshot = (page: Page): Promise<PatternSnapshot> =>
  page.evaluate(() =>
    (globalThis as unknown as { bingo: { getSnapshot(): Promise<PatternSnapshot> } }).bingo.getSnapshot(),
  );

test('an edited active pattern and a new library pattern survive a restart, and New Game leaves them alone', async () => {
  const first = await launchApp(userDataDir);
  await tapBall(first.controller, 'B-3');

  const results = await first.controller.evaluate(async (plus) => {
    const api = (
      globalThis as unknown as {
        bingo: {
          selectPattern(id: string): Promise<{ ok: boolean }>;
          setActivePatternCell(index: number, on: boolean): Promise<{ ok: boolean }>;
          renameActivePattern(title: string): Promise<{ ok: boolean }>;
          createPattern(title: string, cells: boolean[]): Promise<{ ok: boolean }>;
        };
      }
    ).bingo;
    return [
      await api.selectPattern('seed-big-l'),
      await api.setActivePatternCell(12, true),
      await api.renameActivePattern('Big L plus'),
      await api.createPattern('Plus Sign', plus),
    ];
  }, PLUS);
  expect(results.map((result) => result.ok)).toEqual([true, true, true, true]);

  // Starting a new game clears the calls and leaves the pattern exactly as it was.
  await first.controller.getByRole('button', { name: 'New Game' }).click();
  await first.controller.getByRole('button', { name: 'Start New Game' }).click();
  await expect(first.controller.getByTestId('called-count')).toHaveText('Called: 0 of 75');
  const afterNewGame = await snapshot(first.controller);
  expect(afterNewGame.activePattern).toMatchObject({ title: 'Big L plus', editedFromLibrary: true });
  expect(afterNewGame.activePattern.cells[CENTER]).toBe(true);
  await first.app.close();

  // Restart: the edited working copy and the new library pattern are both still there.
  const second = await launchApp(userDataDir);
  const restored = await snapshot(second.controller);
  expect(restored.activePattern).toMatchObject({
    sourcePatternId: 'seed-big-l',
    title: 'Big L plus',
    editedFromLibrary: true,
  });
  expect(restored.activePattern.cells[CENTER]).toBe(true);
  const plusSign = restored.patternLibrary.find((pattern) => pattern.title === 'Plus Sign');
  expect(plusSign?.cells).toEqual(PLUS);
  // The saved Big L was never changed by editing its copy.
  expect(restored.patternLibrary.find((pattern) => pattern.id === 'seed-big-l')?.cells[CENTER]).toBe(false);
  expect(restored.patternLibrary).toHaveLength(6);
  await second.app.close();
});

test('pushing the pattern shows it on the projector; later edits wait for the next push; it survives a restart', async () => {
  const first = await launchApp(userDataDir);
  // The rail layout (with the tappable cells) needs a window of at least 1440 x 780.
  await resizeController(first.app, first.controller, 1536, 864);
  const widget = first.controller.getByRole('region', { name: 'Pattern' });
  await widget.getByRole('combobox').selectOption('seed-big-l');

  await first.controller.getByRole('button', { name: 'Preview' }).click();
  const projector = await waitForPresentationWindow(first.app);
  const shown = projector.getByRole('region', { name: 'Winning pattern' });
  // Nothing is on the projector until the operator pushes it, however the pattern is chosen or edited.
  await expect(shown).toHaveCount(0);

  await widget.getByRole('button', { name: 'Show on projector' }).click();
  await expect(shown.getByRole('heading', { name: 'Big L' })).toBeVisible();
  await expect(projector.getByTestId('pattern-cell-0')).toHaveAttribute('data-on', 'true');
  await expect(projector.getByTestId('pattern-cell-12')).toHaveAttribute('data-on', 'false');

  // Edit the working copy (center on, new name). The projector keeps showing what was pushed.
  await widget.getByRole('button', { name: 'Row 3, column 3' }).click();
  await widget.getByRole('textbox', { name: /Pattern name/ }).fill('Big L plus');
  await widget.getByRole('textbox', { name: /Pattern name/ }).press('Enter');
  const update = widget.getByRole('button', { name: 'Update projector' });
  await expect(update).toBeEnabled();
  await expect(shown.getByRole('heading', { name: 'Big L', exact: true })).toBeVisible();
  await expect(projector.getByTestId('pattern-cell-12')).toHaveAttribute('data-on', 'false');

  await update.click();
  await expect(shown.getByRole('heading', { name: 'Big L plus' })).toBeVisible();
  await expect(projector.getByTestId('pattern-cell-12')).toHaveAttribute('data-on', 'true');

  // Set BINGO_SCREENSHOT_DIR to keep a picture of both screens for review.
  const keepIn = process.env['BINGO_SCREENSHOT_DIR'];
  if (keepIn) {
    await tapBall(first.controller, 'B-3');
    await tapBall(first.controller, 'N-33');
    await first.controller.waitForTimeout(300);
    await writeFile(path.join(keepIn, 'push-controller.png'), await first.controller.screenshot());
    await writeFile(path.join(keepIn, 'push-projector.png'), await projector.screenshot());
    await tapBall(first.controller, 'B-3');
    await tapBall(first.controller, 'N-33');
  }

  // Calls and New Game never disturb it.
  await tapBall(first.controller, 'B-3');
  await first.controller.getByRole('button', { name: 'New Game' }).click();
  await first.controller.getByRole('button', { name: 'Start New Game' }).click();
  await expect(first.controller.getByTestId('called-count')).toHaveText('Called: 0 of 75');
  await expect(shown.getByRole('heading', { name: 'Big L plus' })).toBeVisible();
  await first.app.close();

  // Restart: the projector still shows what was pushed, even though the editor is its own thing.
  const second = await launchApp(userDataDir);
  // Resize before the Preview window exists: the harness resizes the first window it finds.
  await resizeController(second.app, second.controller, 1536, 864);
  await second.controller.getByRole('button', { name: 'Preview' }).click();
  const restored = await waitForPresentationWindow(second.app);
  await expect(restored.getByRole('heading', { name: 'Big L plus' })).toBeVisible();
  await expect(restored.getByTestId('pattern-cell-12')).toHaveAttribute('data-on', 'true');

  // Hide takes it off.
  await second.controller
    .getByRole('region', { name: 'Pattern' })
    .getByRole('button', { name: 'Hide' })
    .click();
  await expect(restored.getByRole('region', { name: 'Winning pattern' })).toHaveCount(0);
  await second.app.close();
});
