/**
 * Milestone 1 Definition of Done, automated as far as possible without a
 * physical second monitor (projecting to a real display is in the manual
 * checklist, docs/manual-acceptance-m1.md).
 */
import { spawn } from 'node:child_process';
import { expect, test } from '@playwright/test';
import {
  PROJECT_ROOT,
  ballLabels,
  bridgeKeys,
  createUserDataDir,
  electronBinary,
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

test('calls sync to Preview and the ordered game survives a restart', { tag: '@smoke' }, async () => {
  const first = await launchApp(userDataDir);
  const { controller } = first;

  // Preview works on a single monitor and shows the empty state.
  await controller.getByRole('button', { name: 'Preview' }).click();
  const presentation = await waitForPresentationWindow(first.app);
  await expect(presentation.getByText('Ready for first call')).toBeVisible();
  await expect(controller.getByRole('status')).toHaveText('Preview window open');

  // Tap B-3: appears immediately on the Presentation window.
  await tapBall(controller, 'B-3');
  await expect(presentation.getByRole('img', { name: 'B-3' })).toBeVisible();

  // Two more calls, then toggle an earlier one off and back on.
  await tapBall(controller, 'B-9');
  await tapBall(controller, 'I-17');
  await tapBall(controller, 'B-9');
  await expect(presentation.getByTestId('board-ball-9')).toHaveAttribute('data-status', 'uncalled');
  await expect(presentation.getByTestId('board-ball-17')).toHaveAttribute('data-status', 'current');
  expect(await ballLabels(presentation.getByRole('list', { name: 'Previous calls' }))).toEqual(['B-3']);

  await tapBall(controller, 'B-9');
  await expect(presentation.getByTestId('board-ball-9')).toHaveAttribute('data-status', 'current');
  expect(await ballLabels(presentation.getByRole('list', { name: 'Previous calls' }))).toEqual([
    'I-17',
    'B-3',
  ]);

  // Closing the Presentation leaves the Controller and the game intact.
  await controller.getByRole('button', { name: 'Stop' }).click();
  await expect(controller.getByRole('status')).toHaveText('Not projecting');
  await expect(controller.getByTestId('called-count')).toHaveText('Called: 3 of 75');

  await first.app.close();

  // Relaunch: the exact order is restored and nothing is projected automatically.
  const second = await launchApp(userDataDir);
  await expect(second.controller.getByTestId('current-call').getByRole('img')).toHaveAccessibleName('B-9');
  expect(await ballLabels(second.controller.getByTestId('previous-calls'))).toEqual(['I-17', 'B-3']);
  await expect(second.controller.getByRole('status')).toHaveText('Not projecting');
  expect(second.app.windows()).toHaveLength(1);
  await second.app.close();
});

test('renderers are sandboxed and the Presentation bridge is read-only', { tag: '@smoke' }, async () => {
  const { app, controller } = await launchApp(userDataDir);

  const nodeGlobals = await controller.evaluate(() => ({
    require: typeof (globalThis as Record<string, unknown>)['require'],
    process: typeof (globalThis as Record<string, unknown>)['process'],
  }));
  expect(nodeGlobals).toEqual({ require: 'undefined', process: 'undefined' });
  expect(await bridgeKeys(controller)).toEqual([
    'closePresentation',
    'controlSlideshow',
    'createPattern',
    'deletePattern',
    'dismissBingoBanner',
    'dismissNotice',
    'duplicatePattern',
    'editSlideshow',
    'getSnapshot',
    'hidePatternOnProjector',
    'importImages',
    'importSlideshowImages',
    'listDisplays',
    'newGame',
    'onSnapshot',
    'openPresentation',
    'openPreview',
    'pauseTimer',
    'removeImage',
    'renameActivePattern',
    'renamePattern',
    'resetTimer',
    'resumeTimer',
    'saveActivePatternAsNew',
    'selectPattern',
    'selectSingleImage',
    'setActivePatternCell',
    'setCountdownMessage',
    'setImageFit',
    'setPresentationMode',
    'setTimerDuration',
    'showBingoBanner',
    'showPatternOnProjector',
    'startTimer',
    'toggleBall',
    'toggleRowDisabled',
    'updateSavedPattern',
  ]);

  await controller.getByRole('button', { name: 'Preview' }).click();
  const presentation = await waitForPresentationWindow(app);
  expect(await bridgeKeys(presentation)).toEqual(['getSnapshot', 'onSnapshot']);
  await expect(presentation.getByRole('button')).toHaveCount(0);

  await app.close();
});

test('a second launch does not start a second instance', async () => {
  const first = await launchApp(userDataDir);

  // Spawn a second copy directly (Playwright cannot attach to a process that exits at once).
  const second = spawn(electronBinary, [PROJECT_ROOT], {
    env: { ...process.env, BINGO_USER_DATA_DIR: userDataDir },
    stdio: 'ignore',
  });
  const exitCode = await new Promise<number | null>((resolve) => second.on('exit', resolve));
  expect(exitCode).toBe(0);
  expect(first.app.windows()).toHaveLength(1);
  await first.app.close();
});

test('closing the Controller window with a healthy disk quits promptly and keeps the calls', async () => {
  const { app, controller } = await launchApp(userDataDir);
  await controller.getByRole('button', { name: 'Preview' }).click();
  await waitForPresentationWindow(app);
  await tapBall(controller, 'G-50');
  await tapBall(controller, 'O-71');

  // Close the Controller the way the operator would (title-bar X / Alt+F4), not via app.quit().
  const exited = new Promise<void>((resolve) => app.process().once('exit', () => resolve()));
  const started = Date.now();
  await app.evaluate(({ BrowserWindow }) => {
    const controllerWindow = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().includes('controller'),
    );
    controllerWindow?.close();
  });
  await exited;
  // No dialog was needed: the close guard found everything saved.
  expect(Date.now() - started).toBeLessThan(5000);

  const reopened = await launchApp(userDataDir);
  expect(await ballLabels(reopened.controller.getByTestId('current-call'))).toEqual(['O-71']);
  expect(await ballLabels(reopened.controller.getByTestId('previous-calls'))).toEqual(['G-50']);
  await reopened.app.close();
});
