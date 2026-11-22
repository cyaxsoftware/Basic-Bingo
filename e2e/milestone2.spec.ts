/**
 * Milestone 2 end-to-end checks, added card by card as M2 features land.
 */
import { expect, test, type Page } from '@playwright/test';
import {
  ballLabels,
  createUserDataDir,
  findPresentationWindow,
  focusIsWithin,
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

/** The Controller has no mode tabs yet (they arrive with the touch layout), so use its real bridge. */
function setMode(controller: Page, mode: string) {
  return controller.evaluate(
    (value) =>
      (
        globalThis as unknown as { bingo: { setPresentationMode(m: string): Promise<{ ok: boolean }> } }
      ).bingo.setPresentationMode(value),
    mode,
  );
}

test('the presentation mode switches the audience view without touching the game, and survives a restart', async () => {
  const first = await launchApp(userDataDir);
  const { controller } = first;
  await tapBall(controller, 'B-3');
  await tapBall(controller, 'I-17');

  await controller.getByRole('button', { name: 'Preview' }).click();
  const presentation = await waitForPresentationWindow(first.app);
  await expect(presentation.getByRole('img', { name: 'I-17' })).toBeVisible();

  // A non-board mode shows a placeholder (never a blank screen) and the game is intact.
  expect(await setMode(controller, 'slideshow')).toEqual({ ok: true });
  await expect(presentation.getByRole('heading', { name: 'Break Slideshow' })).toBeVisible();
  await expect(presentation.getByText('Coming soon')).toBeVisible();
  await expect(controller.getByTestId('called-count')).toHaveText('Called: 2 of 75');

  // An invalid mode is rejected and changes nothing.
  expect(await setMode(controller, 'photos')).toMatchObject({ ok: false });
  await expect(presentation.getByRole('heading', { name: 'Break Slideshow' })).toBeVisible();

  await first.app.close();

  // Relaunch: the mode and the ordered calls are both restored.
  const second = await launchApp(userDataDir);
  expect(await ballLabels(second.controller.getByTestId('previous-calls'))).toEqual(['B-3']);
  await second.controller.getByRole('button', { name: 'Preview' }).click();
  const page = await findPresentationWindow(second.app);
  await expect(page.getByRole('heading', { name: 'Break Slideshow' })).toBeVisible();

  // Back to the board: the same game is shown.
  expect(await setMode(second.controller, 'gameBoard')).toEqual({ ok: true });
  await expect(page.getByRole('img', { name: 'I-17' })).toBeVisible();
  await second.app.close();
});

test('BINGO banner and New Game work in the real app, and the confirmation traps and restores focus', async () => {
  const { app, controller } = await launchApp(userDataDir);
  await tapBall(controller, 'B-3');
  await tapBall(controller, 'I-17');

  await controller.getByRole('button', { name: 'BINGO CALLED' }).click();
  await expect(controller.getByRole('button', { name: 'Dismiss BINGO Banner' })).toBeVisible();
  await controller.getByRole('button', { name: 'Dismiss BINGO Banner' }).click();
  await expect(controller.getByRole('button', { name: 'BINGO CALLED' })).toBeVisible();
  await expect(controller.getByTestId('called-count')).toHaveText('Called: 2 of 75');

  // Cancel leaves the game alone and puts focus back on the button that opened the dialog.
  const newGame = controller.getByRole('button', { name: 'New Game' });
  await newGame.click();
  const dialog = controller.getByRole('dialog', { name: 'Start a new game?' });
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();

  // Tab never leaves the dialog, in either direction.
  for (let i = 0; i < 4; i += 1) {
    await controller.keyboard.press('Tab');
    expect(await focusIsWithin(dialog)).toBe(true);
  }
  await controller.keyboard.press('Shift+Tab');
  expect(await focusIsWithin(dialog)).toBe(true);

  await controller.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(newGame).toBeFocused();
  await expect(controller.getByTestId('called-count')).toHaveText('Called: 2 of 75');

  // Confirm clears the calls and the banner.
  await controller.getByRole('button', { name: 'BINGO CALLED' }).click();
  await newGame.click();
  await dialog.getByRole('button', { name: 'Start New Game' }).click();
  await expect(controller.getByTestId('called-count')).toHaveText('Called: 0 of 75');
  await expect(controller.getByRole('button', { name: 'BINGO CALLED' })).toBeVisible();

  await app.close();
});
