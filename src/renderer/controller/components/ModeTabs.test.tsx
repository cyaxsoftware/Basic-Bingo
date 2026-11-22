import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { PresentationMode } from '../../../shared/presentation/presentationMode';
import { createSnapshotStore } from '../../shared/snapshotStore';
import { createFakeBingoApi, makeSnapshot } from '../../test/fakeBingoApi';
import { ControllerApp } from '../ControllerApp';
import { ModeTabs } from './ModeTabs';

const LABELS = ['Game Board', 'Break Slideshow', 'Single Image', 'Countdown'];

function renderTabs(mode: PresentationMode = 'gameBoard') {
  const onSelect = vi.fn();
  render(<ModeTabs mode={mode} onSelect={onSelect} panelId="panel" />);
  return onSelect;
}

const tab = (name: string) => screen.getByRole('tab', { name });

describe('ModeTabs', () => {
  it('shows the four presentation modes in a labelled tablist', () => {
    renderTabs();
    const list = screen.getByRole('tablist', { name: 'Presentation mode' });
    expect(
      within(list)
        .getAllByRole('tab')
        .map((t) => t.textContent),
    ).toEqual(LABELS);
  });

  it.each([
    ['gameBoard', 'Game Board'],
    ['slideshow', 'Break Slideshow'],
    ['singleImage', 'Single Image'],
    ['countdown', 'Countdown'],
  ] as const)('marks only the current mode (%s) as selected', (mode, label) => {
    renderTabs(mode);
    for (const name of LABELS) {
      expect(tab(name)).toHaveAttribute('aria-selected', String(name === label));
    }
  });

  it('selects a mode on tap', async () => {
    const onSelect = renderTabs();
    await userEvent.click(tab('Countdown'));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('countdown');
  });

  it('is one tab stop (the selected tab); the others are reached with the arrow keys', async () => {
    renderTabs('slideshow');
    expect(tab('Break Slideshow')).toHaveAttribute('tabindex', '0');
    for (const name of ['Game Board', 'Single Image', 'Countdown']) {
      expect(tab(name)).toHaveAttribute('tabindex', '-1');
    }
    await userEvent.tab();
    expect(tab('Break Slideshow')).toHaveFocus();
  });

  it('moves focus with the arrow keys, Home and End, wrapping, WITHOUT switching the projector', async () => {
    const onSelect = renderTabs();
    await userEvent.tab();
    expect(tab('Game Board')).toHaveFocus();

    await userEvent.keyboard('{ArrowRight}');
    expect(tab('Break Slideshow')).toHaveFocus();
    await userEvent.keyboard('{End}');
    expect(tab('Countdown')).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}'); // wraps
    expect(tab('Game Board')).toHaveFocus();
    await userEvent.keyboard('{ArrowLeft}'); // wraps back
    expect(tab('Countdown')).toHaveFocus();
    await userEvent.keyboard('{Home}');
    expect(tab('Game Board')).toHaveFocus();

    // Arrowing around is only navigation: the audience screen is untouched.
    expect(onSelect).not.toHaveBeenCalled();
  });

  it.each(['{Enter}', ' '])('switches the mode on a deliberate key press (%j)', async (key) => {
    const onSelect = renderTabs();
    await userEvent.tab();
    await userEvent.keyboard('{ArrowRight}{ArrowRight}');
    expect(tab('Single Image')).toHaveFocus();
    await userEvent.keyboard(key);
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('singleImage');
  });
});

describe('mode tabs in the Controller', () => {
  function renderController(extra = {}) {
    const game = { calledNumbers: [3, 17, 9], bingoBannerVisible: false };
    const api = createFakeBingoApi(makeSnapshot({ game, ...extra }));
    render(<ControllerApp api={api} store={createSnapshotStore(api)} />);
    return api;
  }

  it('starts on Game Board with the ball grid in the tabpanel', async () => {
    renderController();
    const panel = await screen.findByRole('tabpanel', { name: 'Game Board' });
    expect(tab('Game Board')).toHaveAttribute('aria-selected', 'true');
    expect(within(panel).getByRole('group', { name: 'B row' })).toBeInTheDocument();
  });

  it('switches mode through the bridge and reflects it in the tabs and the panel', async () => {
    const api = renderController();
    await screen.findByRole('group', { name: 'B row' });

    await userEvent.click(tab('Break Slideshow'));
    expect(api.setPresentationMode).toHaveBeenCalledExactlyOnceWith('slideshow');
    expect(api.current().presentationMode).toBe('slideshow');
    expect(tab('Break Slideshow')).toHaveAttribute('aria-selected', 'true');
    expect(tab('Game Board')).toHaveAttribute('aria-selected', 'false');

    const panel = screen.getByRole('tabpanel', { name: 'Break Slideshow' });
    expect(within(panel).getByRole('heading', { name: 'Break Slideshow' })).toBeInTheDocument();
    expect(within(panel).getByText(/Your game is untouched/)).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'B row' })).not.toBeInTheDocument();
  });

  it('switching modes never changes the game, and the grid comes back as it was', async () => {
    const api = renderController();
    await screen.findByRole('group', { name: 'B row' });
    const game = api.current().game;

    for (const name of ['Break Slideshow', 'Single Image', 'Countdown']) {
      await userEvent.click(tab(name));
      expect(api.current().game).toBe(game);
    }
    await userEvent.click(tab('Game Board'));
    expect(api.current().game).toBe(game);
    expect(screen.getByRole('button', { name: 'B-9, current call' })).toBeInTheDocument();
    expect(screen.getByTestId('called-count')).toHaveTextContent('Called: 3 of 75');
  });

  it('keeps the call summary and the BINGO control available in every mode', async () => {
    renderController({ presentationMode: 'countdown' });
    await screen.findByRole('tabpanel', { name: 'Countdown' });
    expect(screen.getByTestId('called-count')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'BINGO CALLED' })).toBeInTheDocument();
  });

  it('follows a mode set elsewhere, because the snapshot is the source of truth', async () => {
    const api = renderController();
    await screen.findByRole('group', { name: 'B row' });
    api.push(makeSnapshot({ revision: 9, presentationMode: 'singleImage' }));
    expect(await screen.findByRole('tabpanel', { name: 'Single Image' })).toBeInTheDocument();
    expect(tab('Single Image')).toHaveAttribute('aria-selected', 'true');
  });

  it('labels the panel by the selected tab', async () => {
    renderController({ presentationMode: 'slideshow' });
    const panel = await screen.findByRole('tabpanel');
    expect(panel).toHaveAccessibleName('Break Slideshow');
    expect(tab('Break Slideshow')).toHaveAttribute('aria-controls', panel.id);
  });
});
