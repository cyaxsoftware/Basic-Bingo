import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { afterEach, expect, it, vi } from 'vitest';
import { ControllerApp } from '../controller/ControllerApp';
import { PresentationApp } from '../presentation/PresentationApp';
import { createSnapshotStore } from '../shared/snapshotStore';
import { EMPTY_GAME_LOG } from '../../shared/games/gameLog';
import type { MediaItem } from '../../shared/media';
import { createFakeBingoApi, makeSnapshot } from './fakeBingoApi';

const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'];
const image: MediaItem = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Sponsors.png',
  format: 'png',
  bytes: 1000,
  width: 1200,
  height: 600,
  addedAt: '2026-11-22T00:00:00Z',
  fit: 'fill',
};
const populated = makeSnapshot({
  game: { calledNumbers: [3, 17, 31, 52, 75], disabledRows: ['B'], bingoBannerVisible: false },
  gameLog: {
    ...EMPTY_GAME_LOG,
    records: [
      { id: 'game-1', number: 1, startedAt: 1_700_000_000_000, title: 'Four Corners', durationSeconds: 600 },
    ],
  },
  persistence: {
    kind: 'error',
    message: 'The disk is full.',
    problem: 'disk-full',
    failedAt: '2026-11-22T00:00:00Z',
  },
  mediaLibrary: [image],
  singleImage: { imageId: image.id },
  slideshow: {
    activeId: 'collection',
    collections: [
      {
        id: 'collection',
        name: 'Sponsors',
        secondsPerSlide: 8,
        fit: 'fit',
        slides: [{ mediaId: image.id, fit: null }],
      },
    ],
  },
});

async function expectAccessible(root: Element, state: string) {
  const { violations } = await axe.run(root, {
    runOnly: { type: 'tag', values: tags },
    // jsdom has no layout or compositing. Headless Chromium and Electron cover contrast.
    rules: { 'color-contrast': { enabled: false } },
  });
  const serious = violations
    .filter(({ impact }) => impact === 'serious' || impact === 'critical')
    .map(({ id, nodes }) => ({ id, targets: nodes.map(({ target }) => target) }));
  if (serious.length) throw new Error(`${state}: ${JSON.stringify(serious)}`);
}

function renderController(snapshot = populated) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    media: query,
    matches: true, // Exercise the desktop rail and games-played history.
    addEventListener() {},
    removeEventListener() {},
  }));
  const api = createFakeBingoApi(snapshot);
  return render(<ControllerApp api={api} store={createSnapshotStore(api)} />);
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete document.documentElement.dataset['theme'];
});

it.each(['light', 'dark'] as const)(
  'audits Controller screens and dialogs in %s mode',
  async (controllerTheme) => {
    const { container } = renderController({ ...populated, controllerTheme });
    const user = userEvent.setup();
    const clickButton = async (name: string) => user.click(await screen.findByRole('button', { name }));
    await screen.findByRole('tab', { name: 'Game Board' });
    await expectAccessible(container, 'Game Board with calls, blackout and failed save');
    await clickButton('BINGO CALLED');
    await expectAccessible(container, 'Locked Game Board');
    await clickButton('Dismiss BINGO Banner');

    for (const [opener, name] of [
      ['New Game', 'Start a new game?'],
      ['Clear history…', 'Clear the games played?'],
    ] as const) {
      await clickButton(opener);
      const dialog = await screen.findByRole('dialog', { name });
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(dialog).toHaveAccessibleDescription();
      expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
      await expectAccessible(container, name);
      await user.keyboard('{Escape}');
      expect(screen.getByRole('button', { name: opener })).toHaveFocus();
    }

    await clickButton('Edit patterns…');
    await expectAccessible(container, 'Patterns');
    await clickButton('Back to game');
    for (const mode of ['Slideshow', 'Single Image', 'Countdown']) {
      await user.click(screen.getByRole('tab', { name: mode }));
      await expectAccessible(container, mode);
    }
  },
  15000,
);

it('audits the Presentation modes and read-only game state', async () => {
  const api = createFakeBingoApi(populated);
  await api.selectPattern(populated.patternLibrary[0]!.id);
  await api.showPatternOnProjector();
  await api.showBingoBanner();
  await api.startTimer();
  for (const [mode, region] of [
    ['gameBoard', 'Bingo board'],
    ['slideshow', 'Slideshow'],
    ['singleImage', 'Single image'],
    ['countdown', 'Countdown'],
  ] as const) {
    await api.setPresentationMode(mode);
    if (mode === 'slideshow') await api.controlSlideshow({ type: 'start' });
    const { container } = render(<PresentationApp store={createSnapshotStore(api)} />);
    await screen.findByRole('region', { name: region });
    expect(screen.queryByRole('button')).toBeNull();
    await expectAccessible(container, mode);
    cleanup();
  }
});

it('fails the axe gate when the theme switch loses its accessible name', async () => {
  const { container } = renderController();
  const toggle = await screen.findByRole('switch', { name: 'Dark mode' });
  await expectAccessible(container, 'Named theme switch');
  toggle.removeAttribute('aria-label');
  toggle.removeAttribute('title');
  await expect(expectAccessible(container, 'Nameless theme switch')).rejects.toThrow('button-name');
});
