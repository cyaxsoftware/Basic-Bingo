import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createSnapshotStore } from '../../shared/snapshotStore';
import { createFakeBingoApi, makeSnapshot } from '../../test/fakeBingoApi';
import { ControllerApp } from '../ControllerApp';

function renderController(game = { calledNumbers: [3, 17, 9], bingoBannerVisible: false }, extra = {}) {
  const api = createFakeBingoApi(makeSnapshot({ game, ...extra }));
  render(<ControllerApp api={api} store={createSnapshotStore(api)} />);
  return api;
}

const button = (name: string | RegExp) => screen.findByRole('button', { name });

describe('BINGO banner controls', () => {
  it('shows the banner without touching the calls, then offers Dismiss in its place', async () => {
    const api = renderController();
    await userEvent.click(await button('BINGO CALLED'));

    expect(api.showBingoBanner).toHaveBeenCalledTimes(1);
    expect(api.current().game).toEqual({ calledNumbers: [3, 17, 9], bingoBannerVisible: true });
    expect(await button('Dismiss BINGO Banner')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'BINGO CALLED' })).not.toBeInTheDocument();
    expect(screen.getByText(/banner is showing/i)).toHaveAttribute('aria-live', 'polite');
  });

  it('dismisses the banner and leaves the calls and current call alone', async () => {
    const api = renderController({ calledNumbers: [3, 17, 9], bingoBannerVisible: true });
    await userEvent.click(await button('Dismiss BINGO Banner'));

    expect(api.dismissBingoBanner).toHaveBeenCalledTimes(1);
    expect(api.current().game).toEqual({ calledNumbers: [3, 17, 9], bingoBannerVisible: false });
    expect(await button('BINGO CALLED')).toBeInTheDocument();
    expect(within(screen.getByTestId('current-call')).getByRole('img')).toHaveAccessibleName('B-9');
  });

  it('keeps the banner up while balls are tapped; only Dismiss hides it', async () => {
    const api = renderController({ calledNumbers: [3], bingoBannerVisible: true });
    await userEvent.click(await button(/^I-17,/));
    await userEvent.click(await button(/^B-3,/));
    expect(api.current().game).toEqual({ calledNumbers: [17], bingoBannerVisible: true });
    expect(screen.getByRole('button', { name: 'Dismiss BINGO Banner' })).toBeInTheDocument();
  });

  it('reflects a banner raised elsewhere (snapshot is the source of truth)', async () => {
    const api = renderController();
    await button('BINGO CALLED');
    api.push(makeSnapshot({ revision: 5, game: { calledNumbers: [3], bingoBannerVisible: true } }));
    expect(await button('Dismiss BINGO Banner')).toBeInTheDocument();
  });
});

describe('New Game', () => {
  it('opens a confirmation that names what is cleared and what is kept, without clearing anything', async () => {
    const api = renderController({ calledNumbers: [3, 17, 9], bingoBannerVisible: true });
    await userEvent.click(await button('New Game'));

    const dialog = screen.getByRole('dialog', { name: 'Start a new game?' });
    expect(dialog).toHaveTextContent('all 3 called numbers (of 75) and the BINGO banner');
    expect(dialog).toHaveTextContent(/Kept: the winning pattern, saved patterns and images/);
    expect(api.newGame).not.toHaveBeenCalled();
    expect(api.current().game.calledNumbers).toEqual([3, 17, 9]);
  });

  it('says so plainly when there is nothing to clear', async () => {
    renderController({ calledNumbers: [], bingoBannerVisible: false });
    await userEvent.click(await button('New Game'));
    expect(screen.getByRole('dialog')).toHaveTextContent('nothing yet');
  });

  it('Cancel changes nothing and returns focus to New Game', async () => {
    const api = renderController({ calledNumbers: [3, 17, 9], bingoBannerVisible: true });
    await userEvent.click(await button('New Game'));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.newGame).not.toHaveBeenCalled();
    expect(api.current().game).toEqual({ calledNumbers: [3, 17, 9], bingoBannerVisible: true });
    expect(screen.getByRole('button', { name: 'New Game' })).toHaveFocus();
  });

  it('Escape cancels too', async () => {
    const api = renderController();
    await userEvent.click(await button('New Game'));
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.newGame).not.toHaveBeenCalled();
  });

  it('Confirm sends newGame: calls and banner clear, the presentation mode stays', async () => {
    const api = renderController(
      { calledNumbers: [3, 17, 9], bingoBannerVisible: true },
      { presentationMode: 'slideshow' },
    );
    await userEvent.click(await button('New Game'));
    await userEvent.click(screen.getByRole('button', { name: 'Start New Game' }));

    expect(api.newGame).toHaveBeenCalledTimes(1);
    expect(api.current().game).toEqual({ calledNumbers: [], bingoBannerVisible: false });
    expect(api.current().presentationMode).toBe('slideshow');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(await screen.findByText('No calls yet')).toBeInTheDocument();
    expect(await button('BINGO CALLED')).toBeInTheDocument();
  });

  it('is a separate control from the ball grid, so a ball tap can never start a new game', async () => {
    const api = renderController();
    await userEvent.click(await button(/^B-3,/));
    expect(api.newGame).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
