/**
 * Launch helpers for E2E tests. Each test gets its own userData folder, so
 * tests never read or overwrite a real saved game.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import {
  _electron as electron,
  expect,
  type ElectronApplication,
  type Locator,
  type Page,
} from '@playwright/test';

export const PROJECT_ROOT = path.resolve(__dirname, '..');

/** In Node, the electron package exports the path to the Electron executable. */
export const electronBinary = createRequire(__filename)('electron') as string;

export async function createUserDataDir(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), 'bingo-e2e-'));
}

export async function removeUserDataDir(dir: string): Promise<void> {
  // Electron helper processes can hold files for a moment after the app closes.
  await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}

export async function launchApp(
  userDataDir: string,
): Promise<{ app: ElectronApplication; controller: Page }> {
  const app = await electron.launch({
    // Runs the built main bundle (.vite/build/main.cjs via package.json "main").
    args: [PROJECT_ROOT],
    cwd: PROJECT_ROOT,
    env: { ...process.env, BINGO_USER_DATA_DIR: userDataDir },
  });
  const controller = await app.firstWindow();
  // Present in every presentation mode (the ball grid is not: other modes show a placeholder), and
  // rendered only once the first snapshot has arrived, so the whole Controller is ready.
  await controller.getByRole('heading', { name: 'Basic Bingo' }).waitFor();
  return { app, controller };
}

/** Tap a ball on the Controller by label, e.g. tapBall(page, 'B-3'). */
export async function tapBall(controller: Page, label: string): Promise<void> {
  await controller.getByRole('button', { name: new RegExp(`^${label},`) }).click();
}

/** The Presentation window, without assuming which view (board, placeholder...) it is showing. */
export async function findPresentationWindow(app: ElectronApplication): Promise<Page> {
  const existing = app.windows().find((w) => w.url().includes('presentation'));
  const page = existing ?? (await app.waitForEvent('window'));
  await page.waitForLoadState('domcontentloaded');
  return page;
}

/** The Presentation window once it is showing the game board. */
export async function waitForPresentationWindow(app: ElectronApplication): Promise<Page> {
  const page = await findPresentationWindow(app);
  await page.getByLabel('Bingo board').waitFor();
  return page;
}

/** Accessible labels of the ball chips inside a container, in document order. */
export function ballLabels(container: Locator): Promise<(string | null)[]> {
  return container.getByRole('img').evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')));
}

type DocumentLike = { documentElement: { scrollWidth: number; clientWidth: number } };

/** How many pixels the page is wider than its window (0 means no horizontal scrolling). */
export function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => {
    const { document } = globalThis as unknown as { document: DocumentLike };
    return document.documentElement.scrollWidth - document.documentElement.clientWidth;
  });
}

/** How many pixels the page is taller than its window (0 means no vertical scrolling). */
export function verticalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => {
    const { document } = globalThis as unknown as {
      document: { documentElement: { scrollHeight: number; clientHeight: number } };
    };
    return document.documentElement.scrollHeight - document.documentElement.clientHeight;
  });
}

export function viewportSize(page: Page): Promise<{ width: number; height: number }> {
  return page.evaluate(() => {
    const { document } = globalThis as unknown as {
      document: { documentElement: { clientWidth: number; clientHeight: number } };
    };
    return { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight };
  });
}

/**
 * Give the Controller an exact viewport, as a laptop at some Windows scaling would.
 *
 * The app maximizes the window once it is ready to show, which can land after the UI appears, so
 * wait for that first or the late maximize would undo the resize. The window's minimum size is
 * lowered because a real small work area shrinks it too, while this test screen is larger.
 */
export async function resizeController(
  app: ElectronApplication,
  controller: Page,
  width: number,
  height: number,
): Promise<{ width: number; height: number }> {
  // Only the first resize has to wait for that maximize; later ones find the window already resized.
  const settled = () =>
    app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      return window ? window.isMaximized() || window.getMinimumSize()[0] === 300 : false;
    });
  await expect.poll(settled).toBe(true);
  await app.evaluate(
    ({ BrowserWindow }, size) => {
      const window = BrowserWindow.getAllWindows()[0];
      window?.unmaximize();
      window?.setMinimumSize(300, 300);
      window?.setContentSize(size.width, size.height);
    },
    { width, height },
  );
  await expect.poll(() => viewportSize(controller)).toEqual({ width, height });
  return viewportSize(controller);
}

/** Resize the Presentation window's content area (a Preview window is freely resizable). */
export async function resizePresentation(
  app: ElectronApplication,
  page: Page,
  width: number,
  height: number,
): Promise<{ width: number; height: number }> {
  await app.evaluate(
    ({ BrowserWindow }, size) => {
      const window = BrowserWindow.getAllWindows().find((w) =>
        w.webContents.getURL().includes('presentation'),
      );
      window?.setContentSize(size.width, size.height);
    },
    { width, height },
  );
  await expect.poll(() => viewportSize(page)).toEqual({ width, height });
  return viewportSize(page);
}

export function viewportWidth(page: Page): Promise<number> {
  return page.evaluate(() => {
    const { document } = globalThis as unknown as { document: DocumentLike };
    return document.documentElement.clientWidth;
  });
}

/** Whether keyboard focus is currently on, or inside, the given element. */
export function focusIsWithin(container: Locator): Promise<boolean> {
  return container.evaluate((el) => {
    const { document } = globalThis as unknown as { document: { activeElement: unknown } };
    return el.contains(document.activeElement as Parameters<typeof el.contains>[0]);
  });
}

/** Function names exposed on the window's preload bridge. */
export function bridgeKeys(page: Page): Promise<string[]> {
  return page.evaluate(() => Object.keys((globalThis as unknown as { bingo: object }).bingo).toSorted());
}
