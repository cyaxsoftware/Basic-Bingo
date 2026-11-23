/**
 * Milestone 2 end-to-end checks, added card by card as M2 features land.
 */
import { expect, test, type Page } from '@playwright/test';
import {
  ballLabels,
  createUserDataDir,
  findPresentationWindow,
  focusIsWithin,
  horizontalOverflow,
  launchApp,
  removeUserDataDir,
  resizeController,
  resizePresentation,
  tapBall,
  verticalOverflow,
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
  await expect(presentation.getByRole('region', { name: 'Break Slideshow' })).toBeVisible();
  await expect(presentation.getByText('No slideshow selected')).toBeVisible();

  // An invalid mode is rejected and changes nothing.
  expect(await setMode(controller, 'photos')).toMatchObject({ ok: false });
  await expect(presentation.getByRole('region', { name: 'Break Slideshow' })).toBeVisible();

  await first.app.close();

  // Relaunch: the mode and the ordered calls are both restored.
  const second = await launchApp(userDataDir);
  await second.controller.getByRole('button', { name: 'Preview' }).click();
  const page = await findPresentationWindow(second.app);
  await expect(page.getByRole('region', { name: 'Break Slideshow' })).toBeVisible();

  // Back to the board: the same game is shown.
  expect(await setMode(second.controller, 'gameBoard')).toEqual({ ok: true });
  await expect(second.controller.getByTestId('called-count')).toHaveText('Called: 2 of 75');
  expect(await ballLabels(second.controller.getByTestId('previous-calls'))).toEqual(['B-3']);
  await expect(page.getByRole('img', { name: 'I-17' })).toBeVisible();
  await second.app.close();
});

test('BINGO banner, New Game and the dialog focus trap', { tag: '@smoke' }, async () => {
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

  // Clicking the shaded backdrop neither dismisses the dialog nor costs it keyboard control.
  await newGame.click();
  await expect(dialog).toBeVisible();
  await dialog.locator('..').click({ position: { x: 5, y: 5 } });
  await expect(dialog).toBeVisible();
  await controller.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(newGame).toBeFocused();

  // Raising and dismissing the banner by keyboard keeps focus on the same control.
  await controller.getByRole('button', { name: 'BINGO CALLED' }).focus();
  await controller.keyboard.press('Enter');
  await expect(controller.getByRole('button', { name: 'Dismiss BINGO Banner' })).toBeFocused();
  await expect(controller.getByText('BINGO banner enabled')).toBeVisible();
  await controller.keyboard.press('Enter');
  await expect(controller.getByRole('button', { name: 'BINGO CALLED' })).toBeFocused();

  // Confirm clears the calls and the banner.
  await controller.getByRole('button', { name: 'BINGO CALLED' }).click();
  await newGame.click();
  await dialog.getByRole('button', { name: 'Start New Game' }).click();
  await expect(controller.getByTestId('called-count')).toHaveText('Called: 0 of 75');
  await expect(controller.getByRole('button', { name: 'BINGO CALLED' })).toBeVisible();

  await app.close();
});

test('the BINGO control never forces horizontal scrolling at 150% laptop scaling with a full history', async () => {
  const { app, controller } = await launchApp(userDataDir);
  // 150% scaling on a 1366-wide laptop leaves roughly 910 CSS pixels.
  await resizeController(app, controller, 910, 700);

  for (const label of ['B-3', 'I-17', 'N-33', 'G-48', 'O-61', 'B-9']) await tapBall(controller, label);
  await expect(controller.getByTestId('previous-calls').getByRole('img')).toHaveCount(5);

  for (const state of ['idle', 'banner up']) {
    if (state === 'banner up') await controller.getByRole('button', { name: 'BINGO CALLED' }).click();
    expect(await horizontalOverflow(controller), state).toBe(0);
    const control = controller.getByRole('button', { name: /BINGO CALLED|Dismiss BINGO Banner/ });
    const box = await control.boundingBox();
    expect(box && box.x + box.width, state).toBeLessThanOrEqual(910);
  }
  await app.close();
});

const BANNER_TEXT = 'BINGO CALLED — PLEASE HOLD YOUR CARDS';

test('BINGO CALLED shows the banner on Preview until Dismiss', { tag: '@smoke' }, async () => {
  const { app, controller } = await launchApp(userDataDir);
  await tapBall(controller, 'B-3');
  await tapBall(controller, 'I-17');
  await controller.getByRole('button', { name: 'Preview' }).click();
  const presentation = await waitForPresentationWindow(app);
  const banner = presentation.getByRole('alert');
  await expect(banner).toBeHidden();

  await controller.getByRole('button', { name: 'BINGO CALLED' }).click();
  await expect(banner).toHaveText(BANNER_TEXT);
  // Colours come from design tokens; a token that failed to resolve would leave no background at all.
  await expect(banner).toHaveCSS('background-color', 'rgb(185, 28, 28)');
  await expect(banner).toHaveCSS('color', 'rgb(255, 255, 255)');
  // The board and the current call stay visible underneath it.
  await expect(presentation.getByRole('img', { name: 'I-17' })).toBeVisible();
  await expect(presentation.getByLabel('Bingo board')).toBeVisible();
  // The audience window gained no controls.
  await expect(presentation.getByRole('button')).toHaveCount(0);

  // More calls while it is up: the banner stays.
  await tapBall(controller, 'N-33');
  await expect(banner).toHaveText(BANNER_TEXT);

  // Away from the board and back: the flag was never touched, so the banner returns.
  await controller.evaluate(() =>
    (
      globalThis as unknown as { bingo: { setPresentationMode(m: string): Promise<unknown> } }
    ).bingo.setPresentationMode('slideshow'),
  );
  await expect(presentation.getByRole('region', { name: 'Break Slideshow' })).toBeVisible();
  await expect(banner).toBeHidden();
  await controller.evaluate(() =>
    (
      globalThis as unknown as { bingo: { setPresentationMode(m: string): Promise<unknown> } }
    ).bingo.setPresentationMode('gameBoard'),
  );
  await expect(banner).toHaveText(BANNER_TEXT);

  // Closing and reopening the Presentation window does not lose it.
  await controller.getByRole('button', { name: 'Stop' }).click();
  await expect(controller.getByRole('status')).toHaveText('Not projecting');
  await controller.getByRole('button', { name: 'Preview' }).click();
  const reopened = await waitForPresentationWindow(app);
  await expect(reopened.getByRole('alert')).toHaveText(BANNER_TEXT);

  // Dismiss removes it and leaves every call exactly as it was.
  await controller.getByRole('button', { name: 'Dismiss BINGO Banner' }).click();
  await expect(reopened.getByRole('alert')).toBeHidden();
  expect(await ballLabels(controller.getByTestId('previous-calls'))).toEqual(['I-17', 'B-3']);
  await expect(controller.getByTestId('current-call').getByRole('img')).toHaveAccessibleName('N-33');
  await expect(controller.getByTestId('called-count')).toHaveText('Called: 3 of 75');

  await app.close();
});

for (const [name, width, height] of [
  ['16x9', 1920, 1080],
  ['4x3', 1024, 768],
] as const) {
  test(`the banner and the whole board fit on screen at ${name} (${width}x${height})`, async () => {
    const testInfo = test.info();
    const { app, controller } = await launchApp(userDataDir);
    for (const label of ['B-3', 'I-17', 'N-33', 'G-48', 'O-61', 'B-9']) await tapBall(controller, label);
    await controller.getByRole('button', { name: 'BINGO CALLED' }).click();
    await controller.getByRole('button', { name: 'Preview' }).click();
    const presentation = await waitForPresentationWindow(app);
    await expect(presentation.getByRole('alert')).toHaveText(BANNER_TEXT);

    const size = await resizePresentation(app, presentation, width, height);
    // Let the layout settle, then keep a picture of it for a human to look at.
    await presentation.waitForTimeout(300);
    await testInfo.attach(`banner-${name}.png`, {
      body: await presentation.screenshot(),
      contentType: 'image/png',
    });

    expect(await horizontalOverflow(presentation)).toBe(0);
    expect(await verticalOverflow(presentation)).toBe(0);
    for (const [what, locator] of [
      ['banner', presentation.getByRole('alert')],
      ['call display', presentation.getByLabel('Current call', { exact: true })],
      ['board', presentation.getByLabel('Bingo board')],
    ] as const) {
      const box = await locator.boundingBox();
      expect(box, what).not.toBeNull();
      if (!box) continue;
      expect(box.x, `${what} left edge`).toBeGreaterThanOrEqual(0);
      expect(box.y, `${what} top edge`).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, `${what} right edge`).toBeLessThanOrEqual(size.width);
      expect(box.y + box.height, `${what} bottom edge`).toBeLessThanOrEqual(size.height);
    }
    // Every number is still on screen, not clipped away by the banner.
    for (const ball of [1, 75]) {
      const cell = await presentation.getByTestId(`board-ball-${ball}`).boundingBox();
      expect(cell && cell.y + cell.height, `ball ${ball} bottom`).toBeLessThanOrEqual(size.height);
    }
    await app.close();
  });
}

test('the mode tabs drive the projector and mirror the current mode', { tag: '@smoke' }, async () => {
  const { app, controller } = await launchApp(userDataDir);
  await tapBall(controller, 'B-3');
  await controller.getByRole('button', { name: 'Preview' }).click();
  const presentation = await waitForPresentationWindow(app);

  const tab = (name: string) => controller.getByRole('tab', { name });
  await expect(tab('Game Board')).toHaveAttribute('aria-selected', 'true');

  await tab('Break Slideshow').click();
  await expect(tab('Break Slideshow')).toHaveAttribute('aria-selected', 'true');
  await expect(tab('Game Board')).toHaveAttribute('aria-selected', 'false');
  await expect(presentation.getByRole('region', { name: 'Break Slideshow' })).toBeVisible();
  await expect(controller.getByRole('tabpanel', { name: 'Break Slideshow' })).toBeVisible();
  await expect(controller.getByLabel('Bingo balls')).toHaveCount(0);

  // Arrow keys only move focus; the projector changes on Enter.
  await tab('Break Slideshow').focus();
  await controller.keyboard.press('ArrowRight');
  await expect(tab('Single Image')).toBeFocused();
  await expect(tab('Break Slideshow')).toHaveAttribute('aria-selected', 'true');
  await expect(presentation.getByRole('region', { name: 'Break Slideshow' })).toBeVisible();
  await controller.keyboard.press('Enter');
  await expect(tab('Single Image')).toHaveAttribute('aria-selected', 'true');
  await expect(presentation.getByRole('heading', { name: 'Single Image' })).toBeVisible();

  // Back to the board: the same game, untouched.
  await tab('Game Board').click();
  await expect(presentation.getByRole('img', { name: 'B-3' })).toBeVisible();
  await expect(controller.getByTestId('called-count')).toHaveText('Called: 1 of 75');
  await expect(controller.getByRole('button', { name: /^B-3, current call/ })).toBeVisible();

  // The chosen mode survives a restart, and the tab reflects it.
  await tab('Countdown').click();
  await app.close();
  const second = await launchApp(userDataDir);
  await expect(second.controller.getByRole('tab', { name: 'Countdown' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await second.app.close();
});
