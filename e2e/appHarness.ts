/**
 * Launch helpers for E2E tests. Each test gets its own userData folder, so
 * tests never read or overwrite a real saved game.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron, type ElectronApplication, type Locator, type Page } from '@playwright/test';

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
  await controller.getByRole('group', { name: 'B row' }).waitFor();
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
