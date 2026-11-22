/**
 * Milestone 3 end-to-end checks, added card by card as M3 features land.
 *
 * The pattern UI arrives in the next cards, so for now these drive the real preload bridge from inside the
 * Controller page, exactly as the Controller UI will.
 */
import { expect, test, type Page } from '@playwright/test';
import { createUserDataDir, launchApp, removeUserDataDir, tapBall } from './appHarness';

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
