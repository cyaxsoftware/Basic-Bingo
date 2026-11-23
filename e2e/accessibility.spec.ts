import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import {
  createUserDataDir,
  launchApp,
  removeUserDataDir,
  resizeController,
  tapBall,
  waitForPresentationWindow,
} from './appHarness';

const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'];

async function audit(page: Page, state: string) {
  // Electron's context cannot create the auxiliary page used by axe's frame aggregation.
  // These renderers are single documents, so axe can run directly in each window.
  const results = await new AxeBuilder({ page }).setLegacyMode().withTags(tags).analyze();
  expect(
    results.violations.filter(
      ({ impact, id }) => id === 'color-contrast' || impact === 'critical' || impact === 'serious',
    ),
    state,
  ).toEqual([]);
}

test('Controller in both themes and read-only Presentation pass axe', async () => {
  const dir = await createUserDataDir();
  try {
    const { app, controller } = await launchApp(dir);
    try {
      await resizeController(app, controller, 1536, 864);
      for (const ball of ['B-3', 'I-17', 'N-31', 'G-52', 'O-75']) await tapBall(controller, ball);
      await controller.getByRole('button', { name: 'Preview', exact: true }).click();
      const presentation = await waitForPresentationWindow(app);
      await expect(presentation.getByRole('img', { name: 'O-75', exact: true })).toBeVisible();
      const toggle = controller.getByRole('switch', { name: 'Dark mode' });

      for (const theme of ['light', 'dark'] as const) {
        if (theme === 'dark') await toggle.click();
        await expect(toggle).toHaveAttribute('aria-checked', String(theme === 'dark'));
        for (const mode of ['Game Board', 'Slideshow', 'Single Image', 'Countdown']) {
          const tab = controller.getByRole('tab', { name: mode, exact: true });
          await tab.click();
          await expect(tab).toHaveAttribute('aria-selected', 'true');
          await audit(controller, `${theme} Controller / ${mode}`);
          if (theme === 'light') {
            const region = mode === 'Game Board' ? 'Bingo board' : mode;
            await expect(
              presentation.getByRole('region', {
                name: region === 'Single Image' ? 'Single image' : region,
                exact: true,
              }),
            ).toBeVisible();
            await audit(presentation, `Presentation / ${mode}`);
          }
        }

        await controller.getByRole('tab', { name: 'Game Board', exact: true }).click();
        await controller.getByRole('button', { name: 'BINGO CALLED', exact: true }).click();
        await expect(controller.getByRole('button', { name: 'Dismiss BINGO Banner' })).toBeVisible();
        await audit(controller, `${theme} Controller / BINGO CALLED`);
        if (theme === 'dark') {
          await expect(presentation.getByRole('alert')).toContainText('BINGO CALLED');
          await audit(presentation, 'Presentation / BINGO CALLED');
        }
        await controller.getByRole('button', { name: 'Dismiss BINGO Banner' }).click();
        await controller.getByRole('button', { name: 'New Game', exact: true }).click();
        const dialog = controller.getByRole('dialog', { name: 'Start a new game?' });
        await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
        await audit(controller, `${theme} Controller / New Game`);
        await controller.keyboard.press('Escape');
      }
    } finally {
      await app.close();
    }
  } finally {
    await removeUserDataDir(dir);
  }
});
