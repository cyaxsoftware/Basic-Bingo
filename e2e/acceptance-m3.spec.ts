/**
 * Milestone 3 acceptance (design doc §9 "Patterns"), in the real app.
 *
 * The first test in milestone3.spec.ts already covers "edited pattern and a new library pattern survive a
 * restart, New Game leaves them alone" through the bridge, and its second covers pushing a pattern to the
 * projector; this file walks the same items the way an operator does, through the widget and the Patterns
 * screen. What needs real hardware (touch, a physical projector, reading the pattern from the back of a room)
 * is in docs/manual-acceptance-m3.md.
 *
 * The projector shows the pattern the operator last PUSHED, not the live working copy, so "reflected on the
 * projector" means after Show on projector / Update projector.
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
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

const BIG_L = [0, 5, 10, 15, 20, 21, 22, 23, 24];
const CENTER = 12;

/** Open the app wide enough for the pattern rail (tappable cells), then the Preview window. */
async function openGame() {
  const { app, controller } = await launchApp(userDataDir);
  await resizeController(app, controller, 1536, 864);
  const widget = controller.getByRole('region', { name: 'Pattern' });
  await controller.getByRole('button', { name: 'Preview' }).click();
  const projector = await waitForPresentationWindow(app);
  return { app, controller, widget, projector };
}

/** Which of the 25 squares the projector shows lit, as indexes. */
async function projectorLitSquares(projector: Page): Promise<number[]> {
  const lit: number[] = [];
  for (let index = 0; index < 25; index += 1) {
    const on = await projector.getByTestId(`pattern-cell-${index}`).getAttribute('data-on');
    if (on === 'true') lit.push(index);
  }
  return lit;
}

const centerCell = (scope: Locator | Page) => scope.getByRole('button', { name: 'Row 3, column 3' });

test('Big L keeps the center off, and a toggled center reaches the projector only when pushed', async () => {
  const { app, widget, projector } = await openGame();
  await widget.getByRole('combobox').selectOption('seed-big-l');
  await widget.getByRole('button', { name: 'Show on projector' }).click();

  // Big L has no center square, and the projector does not invent one.
  await expect(projector.getByRole('heading', { name: 'Big L' })).toBeVisible();
  expect(await projectorLitSquares(projector)).toEqual(BIG_L);
  await expect(projector.getByTestId(`pattern-cell-${CENTER}`)).toHaveAttribute('data-on', 'false');

  // Turn the center on in the editor: the projector keeps showing what was pushed until the operator pushes.
  await centerCell(widget).click();
  await expect(centerCell(widget)).toHaveAttribute('aria-pressed', 'true');
  const update = widget.getByRole('button', { name: 'Update projector' });
  await expect(update).toBeEnabled();
  expect(await projectorLitSquares(projector)).toEqual(BIG_L);

  await update.click();
  await expect(projector.getByTestId(`pattern-cell-${CENTER}`)).toHaveAttribute('data-on', 'true');
  expect(await projectorLitSquares(projector)).toEqual([...BIG_L, CENTER].toSorted((a, b) => a - b));

  // And back off again.
  await centerCell(widget).click();
  await widget.getByRole('button', { name: 'Update projector' }).click();
  await expect(projector.getByTestId(`pattern-cell-${CENTER}`)).toHaveAttribute('data-on', 'false');
  expect(await projectorLitSquares(projector)).toEqual(BIG_L);
  await app.close();
});

test('Renaming and editing the pattern during a game leaves the calls alone, then saves to the library', async () => {
  const { app, controller, widget, projector } = await openGame();
  await tapBall(controller, 'B-3');
  await tapBall(controller, 'N-33');
  await widget.getByRole('combobox').selectOption('seed-big-l');

  // Rename and edit in place, mid-game.
  const name = widget.getByRole('textbox', { name: /Pattern name/ });
  await name.fill('Big L plus');
  await name.press('Enter');
  await centerCell(widget).click();
  await expect(widget.getByText('Edited')).toBeVisible();

  // The game carries on: calls, count and the projector's board are untouched.
  await expect(controller.getByTestId('called-count')).toHaveText('Called: 2 of 75');
  await expect(projector.getByTestId('board-ball-33')).toHaveAttribute('data-status', 'current');
  await expect(projector.getByTestId('board-ball-3')).toHaveAttribute('data-status', 'called');

  // The saved Big L is not changed by editing its copy; Update Saved Pattern is the explicit step.
  await widget.getByRole('button', { name: 'Edit patterns…' }).click();
  const patterns = controller.getByRole('region', { name: 'Patterns' });
  await expect(patterns.getByRole('button', { name: 'Big L', exact: true })).toBeVisible();
  await patterns.getByRole('button', { name: 'Update Saved Pattern' }).click();
  await expect(patterns.getByRole('button', { name: 'Big L plus', exact: true })).toBeVisible();
  await expect(patterns.getByText('Edited')).toHaveCount(0);
  await app.close();
});

test('A new library pattern is made, named and kept; it is the pattern in play after a restart, and New Game keeps it', async () => {
  const first = await openGame();
  await first.widget.getByRole('button', { name: 'Edit patterns…' }).click();
  const patterns = first.controller.getByRole('region', { name: 'Patterns' });

  // Add a blank pattern, name it, and light the four corners.
  await patterns.getByRole('button', { name: 'Add pattern' }).click();
  await expect(patterns.getByRole('button', { name: 'New pattern', exact: true })).toHaveAttribute(
    'aria-current',
    'true',
  );
  await patterns.getByRole('button', { name: 'Rename' }).click();
  const rename = patterns.getByRole('textbox', { name: 'Rename New pattern' });
  await rename.fill('Corners');
  await rename.press('Enter');
  await expect(patterns.getByRole('button', { name: 'Corners', exact: true })).toHaveAttribute(
    'aria-current',
    'true',
  );
  for (const name of ['Row 1, column 1', 'Row 1, column 5', 'Row 5, column 1', 'Row 5, column 5']) {
    await patterns.getByRole('button', { name }).click();
  }
  await patterns.getByRole('button', { name: 'Update Saved Pattern' }).click();
  await expect(patterns.getByText('Edited')).toHaveCount(0);

  // New Game clears the calls and leaves the pattern.
  await first.controller.getByRole('button', { name: /Back to game/ }).click();
  await tapBall(first.controller, 'B-3');
  await first.controller.getByRole('button', { name: 'New Game' }).click();
  await first.controller.getByRole('button', { name: 'Start New Game' }).click();
  await expect(first.controller.getByTestId('called-count')).toHaveText('Called: 0 of 75');
  await expect(first.widget.getByRole('textbox', { name: /Pattern name/ })).toHaveValue('Corners');
  await first.app.close();

  // Restart: the new pattern is saved in the library, and it is still the pattern in play.
  const second = await launchApp(userDataDir);
  await resizeController(second.app, second.controller, 1536, 864);
  const widget = second.controller.getByRole('region', { name: 'Pattern' });
  await expect(widget.getByRole('textbox', { name: /Pattern name/ })).toHaveValue('Corners');
  // Exactly one saved pattern with this name (the built-in "Four Corners" is a different one).
  await expect(widget.getByRole('option', { name: 'Corners', exact: true })).toHaveCount(1);
  for (const name of ['Row 1, column 1', 'Row 1, column 5', 'Row 5, column 1', 'Row 5, column 5']) {
    await expect(widget.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'true');
  }
  await expect(centerCell(widget)).toHaveAttribute('aria-pressed', 'false');
  await second.app.close();
});

test('Deleting the saved pattern in play asks first, then keeps it on the Controller and the projector', async () => {
  const { app, controller, widget, projector } = await openGame();
  await widget.getByRole('combobox').selectOption('seed-big-l');
  await widget.getByRole('button', { name: 'Show on projector' }).click();
  await expect(projector.getByRole('heading', { name: 'Big L' })).toBeVisible();

  await widget.getByRole('button', { name: 'Edit patterns…' }).click();
  const patterns = controller.getByRole('region', { name: 'Patterns' });

  // Cancel changes nothing.
  await patterns.getByRole('button', { name: 'Delete' }).click();
  const dialog = controller.getByRole('dialog', { name: /Delete “Big L”\?/ });
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(patterns.getByRole('button', { name: 'Big L', exact: true })).toBeVisible();

  // Confirm removes it from the library; the game keeps the pattern as one that is not saved.
  await patterns.getByRole('button', { name: 'Delete' }).click();
  await controller
    .getByRole('dialog', { name: /Delete “Big L”\?/ })
    .getByRole('button', { name: 'Delete Pattern' })
    .click();
  await expect(patterns.getByRole('button', { name: 'Big L', exact: true })).toHaveCount(0);
  await expect(patterns.getByText(/not in the saved library/)).toBeVisible();
  await expect(patterns.getByRole('textbox', { name: /Title/ })).toHaveValue('Big L');
  expect(await projectorLitSquares(projector)).toEqual(BIG_L);
  await expect(projector.getByRole('heading', { name: 'Big L' })).toBeVisible();
  await app.close();
});
