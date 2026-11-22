/**
 * Milestone 2 acceptance (design doc §9 "Ball calls" and "BINGO and reset"), in the real app.
 *
 * Some items are already covered where they were built: the banner, Dismiss and the New Game dialog in
 * milestone2.spec.ts, and the basic toggle sequence and restart in milestone1.spec.ts. This file adds the
 * rest. What needs real hardware (touch, scaling, a physical projector) is in docs/manual-acceptance-m2.md.
 */
import { expect, test, type Page } from '@playwright/test';
import {
  ballLabels,
  createUserDataDir,
  launchApp,
  removeUserDataDir,
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

/** B 1-15, I 16-30, N 31-45, G 46-60, O 61-75, as the Controller labels them. */
function ballName(ball: number): string {
  const letter = 'BINGO'[Math.floor((ball - 1) / 15)];
  return `${letter}-${ball}`;
}

const currentBall = (presentation: Page) =>
  presentation.getByLabel('Current call', { exact: true }).getByRole('img').first();
const previousBalls = (presentation: Page) => presentation.getByRole('list', { name: 'Previous calls' });
const BANNER = 'BINGO CALLED — PLEASE HOLD YOUR CARDS';

test('Ball calls: B3 then B9, removing and re-adding B3, and removing the current call', async () => {
  const { app, controller } = await launchApp(userDataDir);
  await controller.getByRole('button', { name: 'Preview' }).click();
  const presentation = await waitForPresentationWindow(app);

  // Tap B3 then B9: current is B9 and the previous list begins with B3.
  await tapBall(controller, 'B-3');
  await tapBall(controller, 'B-9');
  await expect(currentBall(presentation)).toHaveAccessibleName('B-9');
  expect(await ballLabels(previousBalls(presentation))).toEqual(['B-3']);

  // Tap B3 a second time: it is no longer called, B9 stays current.
  await tapBall(controller, 'B-3');
  await expect(presentation.getByTestId('board-ball-3')).toHaveAttribute('data-status', 'uncalled');
  await expect(currentBall(presentation)).toHaveAccessibleName('B-9');
  await expect(previousBalls(presentation)).toHaveCount(0);
  await expect(controller.getByTestId('called-count')).toHaveText('Called: 1 of 75');

  // Tap B3 again: it becomes the current call and is appended after B9.
  await tapBall(controller, 'B-3');
  await expect(currentBall(presentation)).toHaveAccessibleName('B-3');
  expect(await ballLabels(previousBalls(presentation))).toEqual(['B-9']);

  // Tap the current call: the previous call becomes current again and the previous list updates.
  await tapBall(controller, 'B-3');
  await expect(currentBall(presentation)).toHaveAccessibleName('B-9');
  await expect(previousBalls(presentation)).toHaveCount(0);
  await expect(controller.getByTestId('called-count')).toHaveText('Called: 1 of 75');

  await app.close();
});

test('Ball calls: 75 unique calls leave no duplicate or stale display state', async () => {
  const { app, controller } = await launchApp(userDataDir);
  await controller.getByRole('button', { name: 'Preview' }).click();
  const presentation = await waitForPresentationWindow(app);

  for (let ball = 1; ball <= 75; ball += 1) await tapBall(controller, ballName(ball));

  await expect(controller.getByTestId('called-count')).toHaveText('Called: 75 of 75');
  await expect(presentation.locator('[data-testid^="board-ball-"][data-status="uncalled"]')).toHaveCount(0);
  await expect(presentation.locator('[data-testid^="board-ball-"][data-status="current"]')).toHaveCount(1);
  await expect(presentation.locator('[data-testid^="board-ball-"][data-status="called"]')).toHaveCount(74);
  await expect(currentBall(presentation)).toHaveAccessibleName('O-75');
  // The five before it, newest first, with the current ball not repeated among them.
  expect(await ballLabels(previousBalls(presentation))).toEqual(['O-74', 'O-73', 'O-72', 'O-71', 'O-70']);

  // Taking the last call back leaves a clean state, not a stale O-75.
  await tapBall(controller, 'O-75');
  await expect(controller.getByTestId('called-count')).toHaveText('Called: 74 of 75');
  await expect(currentBall(presentation)).toHaveAccessibleName('O-74');
  await expect(presentation.getByTestId('board-ball-75')).toHaveAttribute('data-status', 'uncalled');

  await app.close();
});

test('BINGO and reset: calls and banner survive a restart, and New Game clears both on the projector', async () => {
  const first = await launchApp(userDataDir);
  for (const label of ['B-3', 'I-17', 'N-33']) await tapBall(first.controller, label);
  await first.controller.getByRole('button', { name: 'BINGO CALLED' }).click();
  await first.app.close();

  // Restart: the same calls in the same order, and the banner is still up.
  const { app, controller } = await launchApp(userDataDir);
  await expect(controller.getByRole('button', { name: 'Dismiss BINGO Banner' })).toBeVisible();
  await expect(controller.getByTestId('called-count')).toHaveText('Called: 3 of 75');
  await expect(controller.getByTestId('current-call').getByRole('img')).toHaveAccessibleName('N-33');
  expect(await ballLabels(controller.getByTestId('previous-calls'))).toEqual(['I-17', 'B-3']);
  await controller.getByRole('button', { name: 'Preview' }).click();
  const presentation = await waitForPresentationWindow(app);
  await expect(presentation.getByRole('alert')).toHaveText(BANNER);
  await expect(currentBall(presentation)).toHaveAccessibleName('N-33');

  // New Game: Cancel leaves everything as it was.
  await controller.getByRole('button', { name: 'New Game' }).click();
  await controller.getByRole('button', { name: 'Cancel' }).click();
  await expect(controller.getByTestId('called-count')).toHaveText('Called: 3 of 75');
  await expect(presentation.getByRole('alert')).toHaveText(BANNER);

  // Confirm: the calls and the banner clear, on the Controller and on the projector.
  await controller.getByRole('button', { name: 'New Game' }).click();
  await controller.getByRole('button', { name: 'Start New Game' }).click();
  await expect(controller.getByTestId('called-count')).toHaveText('Called: 0 of 75');
  await expect(controller.getByRole('button', { name: 'BINGO CALLED' })).toBeVisible();
  await expect(presentation.getByText('Ready for first call')).toBeVisible();
  await expect(presentation.getByRole('alert')).toBeHidden();
  await expect(presentation.locator('[data-testid^="board-ball-"][data-status="uncalled"]')).toHaveCount(75);

  await app.close();
});

test('Projector recovery: closing and reopening Preview mid-game shows the current state', async () => {
  const { app, controller } = await launchApp(userDataDir);
  for (const label of ['B-3', 'B-9', 'I-17']) await tapBall(controller, label);
  await controller.getByRole('button', { name: 'BINGO CALLED' }).click();
  await controller.getByRole('button', { name: 'Preview' }).click();
  const before = await waitForPresentationWindow(app);
  await expect(currentBall(before)).toHaveAccessibleName('I-17');

  await controller.getByRole('button', { name: 'Stop' }).click();
  await expect(controller.getByRole('status')).toHaveText('Not projecting');
  // Calling while no projector is open must still be reflected when one opens again.
  await tapBall(controller, 'G-48');

  await controller.getByRole('button', { name: 'Preview' }).click();
  const after = await waitForPresentationWindow(app);
  await expect(currentBall(after)).toHaveAccessibleName('G-48');
  expect(await ballLabels(previousBalls(after))).toEqual(['I-17', 'B-9', 'B-3']);
  await expect(after.getByRole('alert')).toHaveText(BANNER);
  await expect(after.getByTestId('board-ball-3')).toHaveAttribute('data-status', 'called');
  await expect(controller.getByTestId('called-count')).toHaveText('Called: 4 of 75');

  await app.close();
});
