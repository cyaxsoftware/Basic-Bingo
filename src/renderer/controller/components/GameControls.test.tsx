import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createSnapshotStore } from '../../shared/snapshotStore';
import { createFakeBingoApi, makeSnapshot } from '../../test/fakeBingoApi';
import { ControllerApp } from '../ControllerApp';

function renderController(
  game = { calledNumbers: [3, 17, 9], bingoBannerVisible: false, disabledRows: [] },
  extra = {},
) {
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
    expect(api.current().game).toEqual({
      calledNumbers: [3, 17, 9],
      bingoBannerVisible: true,
      disabledRows: [],
    });
    expect(await button('Dismiss BINGO Banner')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'BINGO CALLED' })).not.toBeInTheDocument();
    const status = screen.getByText('BINGO banner enabled');
    expect(status).toHaveAttribute('aria-live', 'polite');
    // It describes the game flag. With no projector open, it must not claim the audience can see it.
    expect(status).not.toHaveTextContent(/projector/i);
    expect(screen.getByRole('status')).toHaveTextContent('Not projecting');
  });

  it('keeps keyboard focus on the same control when the banner is raised and dismissed', async () => {
    renderController();
    const bingo = await button('BINGO CALLED');
    bingo.focus();
    await userEvent.keyboard('{Enter}');
    const dismiss = await button('Dismiss BINGO Banner');
    expect(dismiss).toBe(bingo); // same DOM element, so focus cannot be dropped
    expect(dismiss).toHaveFocus();

    await userEvent.keyboard('{Enter}');
    const again = await button('BINGO CALLED');
    expect(again).toBe(bingo);
    expect(again).toHaveFocus();
  });

  it('dismisses the banner and leaves the calls and current call alone', async () => {
    const api = renderController({ calledNumbers: [3, 17, 9], bingoBannerVisible: true, disabledRows: [] });
    await userEvent.click(await button('Dismiss BINGO Banner'));

    expect(api.dismissBingoBanner).toHaveBeenCalledTimes(1);
    expect(api.current().game).toEqual({
      calledNumbers: [3, 17, 9],
      bingoBannerVisible: false,
      disabledRows: [],
    });
    expect(await button('BINGO CALLED')).toBeInTheDocument();
    expect(within(screen.getByTestId('current-call')).getByRole('img')).toHaveAccessibleName('B-9');
  });

  it('locks every ball while the banner is up, and unlocks them when it is dismissed', async () => {
    const api = renderController({ calledNumbers: [3], bingoBannerVisible: true, disabledRows: [] });
    const ball = await button(/^I-17,/);
    expect(ball).toBeDisabled();
    expect(screen.getByRole('region', { name: 'Bingo balls' })).toHaveAttribute('data-locked', 'true');
    await userEvent.click(ball);
    await userEvent.click(await button(/^B-3,/));
    expect(api.current().game).toEqual({ calledNumbers: [3], bingoBannerVisible: true, disabledRows: [] });

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss BINGO Banner' }));
    expect(await button(/^I-17,/)).toBeEnabled();
    expect(screen.getByRole('region', { name: 'Bingo balls' })).toHaveAttribute('data-locked', 'false');
    await userEvent.click(await button(/^I-17,/));
    expect(api.current().game.calledNumbers).toEqual([3, 17]);
  });

  it('refuses a ball tap that still reaches the game while the banner is up', async () => {
    const api = renderController({ calledNumbers: [3], bingoBannerVisible: true, disabledRows: [] });
    await button('Dismiss BINGO Banner');
    expect(await api.toggleBall(17)).toMatchObject({ ok: false });
    expect(api.current().game.calledNumbers).toEqual([3]);
  });

  it('reflects a banner raised elsewhere (snapshot is the source of truth)', async () => {
    const api = renderController();
    await button('BINGO CALLED');
    api.push(
      makeSnapshot({ revision: 5, game: { calledNumbers: [3], bingoBannerVisible: true, disabledRows: [] } }),
    );
    expect(await button('Dismiss BINGO Banner')).toBeInTheDocument();
  });
});

describe('New Game', () => {
  it('opens a confirmation that names what is cleared and what is kept, without clearing anything', async () => {
    const api = renderController({ calledNumbers: [3, 17, 9], bingoBannerVisible: true, disabledRows: [] });
    await userEvent.click(await button('New Game'));

    const dialog = screen.getByRole('dialog', { name: 'Start a new game?' });
    expect(dialog).toHaveTextContent('all 3 called numbers (of 75) and the BINGO banner');
    expect(dialog).toHaveTextContent(
      /Kept: the winning pattern, saved patterns and images, and the selected presentation mode/,
    );
    // New Game empties the board the projector shows, so it must not claim to keep that.
    expect(dialog).not.toHaveTextContent(/what the projector is showing/);
    expect(api.newGame).not.toHaveBeenCalled();
    expect(api.current().game.calledNumbers).toEqual([3, 17, 9]);
  });

  it('says so plainly when there is nothing to clear', async () => {
    renderController({ calledNumbers: [], bingoBannerVisible: false, disabledRows: [] });
    await userEvent.click(await button('New Game'));
    expect(screen.getByRole('dialog')).toHaveTextContent('nothing yet');
  });

  it('Cancel changes nothing and returns focus to New Game', async () => {
    const api = renderController({ calledNumbers: [3, 17, 9], bingoBannerVisible: true, disabledRows: [] });
    await userEvent.click(await button('New Game'));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.newGame).not.toHaveBeenCalled();
    expect(api.current().game).toEqual({
      calledNumbers: [3, 17, 9],
      bingoBannerVisible: true,
      disabledRows: [],
    });
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
      { calledNumbers: [3, 17, 9], bingoBannerVisible: true, disabledRows: [] },
      { presentationMode: 'gameBoard' },
    );
    await userEvent.click(await button('New Game'));
    await userEvent.click(screen.getByRole('button', { name: 'Start New Game' }));

    expect(api.newGame).toHaveBeenCalledTimes(1);
    expect(api.current().game).toEqual({ calledNumbers: [], bingoBannerVisible: false, disabledRows: [] });
    expect(api.current().presentationMode).toBe('gameBoard');
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
