import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { createSnapshotStore } from '../shared/snapshotStore';
import { createFakeBingoApi, LAPTOP, makeSnapshot, PROJECTOR } from '../test/fakeBingoApi';
import { ControllerApp } from './ControllerApp';

function renderController(snapshot = makeSnapshot()) {
  const api = createFakeBingoApi(snapshot);
  const store = createSnapshotStore(api);
  render(<ControllerApp api={api} store={store} />);
  return api;
}

const tap = (name: RegExp) => userEvent.click(screen.getByRole('button', { name }));

describe('ControllerApp', () => {
  afterEach(() => {
    delete document.documentElement.dataset['theme'];
  });

  it('runs the milestone 1 call sequence end to end', async () => {
    const api = renderController();
    await screen.findByRole('group', { name: 'B row' });

    await tap(/^B-3,/);
    await tap(/^B-9,/);
    await tap(/^I-17,/);
    await tap(/^B-9,/); // toggle off: order of remaining calls preserved
    expect(api.current().game.calledNumbers).toEqual([3, 17]);
    expect(within(screen.getByTestId('current-call')).getByRole('img')).toHaveAccessibleName('I-17');

    await tap(/^B-9,/); // toggle back on: becomes newest
    expect(api.current().game.calledNumbers).toEqual([3, 17, 9]);
    expect(within(screen.getByTestId('current-call')).getByRole('img')).toHaveAccessibleName('B-9');
    const previous = within(screen.getByTestId('previous-calls')).getAllByRole('img');
    expect(previous.map((el) => el.getAttribute('aria-label'))).toEqual(['I-17', 'B-3']);
    expect(screen.getByTestId('called-count')).toHaveTextContent('Called: 3 of 75');
  });

  it('projects to the default external display and shows status', async () => {
    const api = renderController();
    await userEvent.click(await screen.findByRole('button', { name: 'Project' }));
    expect(api.openPresentation).toHaveBeenCalledWith(PROJECTOR.id);
    expect(await screen.findByRole('status')).toHaveTextContent(`Projecting on ${PROJECTOR.label}`);
    // Project flips into Stop, and Stop flips back.
    expect(screen.queryByRole('button', { name: 'Project' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(api.closePresentation).toHaveBeenCalled();
    expect(await screen.findByRole('button', { name: 'Project' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Stop' })).not.toBeInTheDocument();
  });

  it('offers Preview only when there is no second display', async () => {
    const api = renderController(makeSnapshot({ displays: [LAPTOP] }));
    expect(await screen.findByText(/No second display/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Project' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(api.openPreview).toHaveBeenCalled();
    expect(await screen.findByRole('status')).toHaveTextContent('Preview window open');
  });

  it('switches the Controller between light and dark and applies the saved theme', async () => {
    const api = renderController();
    const toggle = await screen.findByRole('switch', { name: 'Dark mode' });
    expect(document.documentElement.dataset['theme']).toBe('light');

    await userEvent.click(toggle);
    expect(api.setControllerTheme).toHaveBeenCalledWith('dark');
    expect(api.current().controllerTheme).toBe('dark');
    expect(await screen.findByRole('switch', { name: 'Dark mode' })).toHaveAttribute('aria-checked', 'true');
    expect(document.documentElement.dataset['theme']).toBe('dark');

    await userEvent.click(screen.getByRole('switch', { name: 'Dark mode' }));
    expect(api.setControllerTheme).toHaveBeenLastCalledWith('light');
    expect(document.documentElement.dataset['theme']).toBe('light');
  });

  it('opens in the theme that was saved', async () => {
    renderController(makeSnapshot({ controllerTheme: 'dark' }));
    expect(await screen.findByRole('switch', { name: 'Dark mode' })).toHaveAttribute('aria-checked', 'true');
    expect(document.documentElement.dataset['theme']).toBe('dark');
  });

  it('changing the theme leaves the game and the projector alone', async () => {
    const api = renderController();
    await screen.findByRole('group', { name: 'B row' });
    await tap(/^B-3,/);
    const { game, presentation, presentationMode } = api.current();
    await userEvent.click(screen.getByRole('switch', { name: 'Dark mode' }));
    expect(api.current().game).toBe(game);
    expect(api.current().presentation).toBe(presentation);
    expect(api.current().presentationMode).toBe(presentationMode);
  });

  describe('game clock', () => {
    it('appears with the first ball as Game 1 and goes away with New Game', async () => {
      renderController();
      await screen.findByRole('group', { name: 'B row' });
      expect(screen.queryByRole('timer')).not.toBeInTheDocument();

      await tap(/^B-3,/);
      expect(await screen.findByRole('timer', { name: 'Game 1 time' })).toHaveTextContent('Game 1');

      await userEvent.click(screen.getByRole('button', { name: 'New Game' }));
      await userEvent.click(screen.getByRole('button', { name: 'Start New Game' }));
      expect(screen.queryByRole('timer')).not.toBeInTheDocument();

      await tap(/^B-3,/);
      expect(await screen.findByRole('timer', { name: 'Game 2 time' })).toBeInTheDocument();
    });

    it('goes away if every call is taken back', async () => {
      renderController();
      await screen.findByRole('group', { name: 'B row' });
      await tap(/^B-3,/);
      await screen.findByRole('timer');
      await tap(/^B-3,/);
      expect(screen.queryByRole('timer')).not.toBeInTheDocument();
    });

    it('is held while BINGO CALLED is up and runs again when it is dismissed', async () => {
      renderController();
      await screen.findByRole('group', { name: 'B row' });
      await tap(/^B-3,/);
      const face = await screen.findByRole('timer');
      expect(face).toHaveAttribute('title', 'Time since the first ball');

      await userEvent.click(screen.getByRole('button', { name: 'BINGO CALLED' }));
      expect(await screen.findByRole('timer')).toHaveAttribute('title', expect.stringContaining('Held'));

      await userEvent.click(screen.getByRole('button', { name: /^Dismiss/ }));
      expect(await screen.findByRole('timer')).toHaveAttribute('title', 'Time since the first ball');
    });
  });

  describe('games played', () => {
    function setWindowSize(width: number, height = 900) {
      window.matchMedia = ((query: string) => {
        const minWidth = Number(/min-width:\s*(\d+)px/.exec(query)?.[1] ?? 0);
        const minHeight = Number(/min-height:\s*(\d+)px/.exec(query)?.[1] ?? 0);
        return {
          matches: width >= minWidth && height >= minHeight,
          media: query,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
        } as unknown as MediaQueryList;
      }) as typeof window.matchMedia;
    }
    afterEach(() => {
      // @ts-expect-error jsdom has no matchMedia; remove the stand-in so other tests see none
      delete window.matchMedia;
    });

    it('logs a finished game under the board, and clears it after asking', async () => {
      setWindowSize(1536, 864);
      const api = renderController();
      await screen.findByRole('group', { name: 'B row' });
      const log = () => screen.getByRole('region', { name: 'Games played' });
      expect(within(log()).getByText(/No games yet/)).toBeInTheDocument();

      await tap(/^B-3,/);
      await tap(/^I-17,/);
      await userEvent.click(screen.getByRole('button', { name: 'BINGO CALLED' }));
      await userEvent.click(screen.getByRole('button', { name: /^Dismiss/ }));
      // Nothing is logged until the game is over.
      expect(within(log()).getByText(/No games yet/)).toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: 'New Game' }));
      await userEvent.click(screen.getByRole('button', { name: 'Start New Game' }));
      const row = await within(log()).findByRole('row', { name: /Untitled pattern/ });
      expect(row).toHaveTextContent('1');
      expect(row).toHaveTextContent(/\d:\d\d$/);
      expect(api.current().gameLog.records).toHaveLength(1);

      await userEvent.click(screen.getByRole('button', { name: 'Clear history…' }));
      await userEvent.click(screen.getByRole('button', { name: 'Clear history' }));
      expect(api.clearGameLog).toHaveBeenCalledTimes(1);
      expect(await within(log()).findByText(/No games yet/)).toBeInTheDocument();
    });

    it('is not shown on the other tabs, on the Patterns screen or in the compact layout', async () => {
      setWindowSize(1536, 864);
      renderController();
      await screen.findByRole('region', { name: 'Games played' });
      await userEvent.click(screen.getByRole('tab', { name: 'Single Image' }));
      expect(screen.queryByRole('region', { name: 'Games played' })).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole('tab', { name: 'Game Board' }));
      await userEvent.click(screen.getByRole('button', { name: 'Edit patterns…' }));
      expect(screen.queryByRole('region', { name: 'Games played' })).not.toBeInTheDocument();
    });

    it('is left out of the compact layout, which has no room under the board', async () => {
      setWindowSize(1000, 700);
      renderController();
      await screen.findByRole('group', { name: 'B row' });
      expect(screen.queryByRole('region', { name: 'Games played' })).not.toBeInTheDocument();
    });
  });

  it('shows notices and save failures', async () => {
    const api = renderController(
      makeSnapshot({
        notices: [{ id: 'lost', level: 'warning', message: 'Projector disconnected.' }],
        persistence: {
          kind: 'error',
          message: "The game could not be saved because the computer's disk is full. Press Try again.",
          problem: 'disk-full',
          failedAt: 'now',
        },
      }),
    );
    expect(await screen.findByText('Projector disconnected.')).toBeInTheDocument();
    expect(screen.getByText(/disk is full/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(api.dismissNotice).toHaveBeenCalledWith('lost');
    // A failed save offers a way out right there.
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(api.retrySave).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Show data folder' }));
    expect(api.showDataFolder).toHaveBeenCalledTimes(1);
  });

  it('blacks out a row from its letter, which disables its balls, and brings it back', async () => {
    const api = renderController();
    await screen.findByRole('group', { name: 'N row' });
    await tap(/^N-33,/);

    await userEvent.click(screen.getByRole('button', { name: 'Black out N row' }));
    expect(api.current().game.disabledRows).toEqual(['N']);
    expect(api.current().game.calledNumbers).toEqual([33]);
    expect(screen.getByRole('group', { name: 'N row' })).toHaveAttribute('data-disabled', 'true');
    expect(screen.getByRole('button', { name: 'Black out N row' })).toHaveAttribute('aria-pressed', 'true');

    // Its balls cannot be tapped, so nothing can be added to (or taken from) a row the game is not using.
    expect(screen.getByRole('button', { name: /^N-34,/ })).toBeDisabled();
    await tap(/^N-34,/);
    expect(api.current().game.calledNumbers).toEqual([33]);

    await userEvent.click(screen.getByRole('button', { name: 'Black out N row' }));
    expect(api.current().game.disabledRows).toEqual([]);
    expect(screen.getByRole('group', { name: 'N row' })).toHaveAttribute('data-disabled', 'false');
    await tap(/^N-34,/);
    expect(api.current().game.calledNumbers).toEqual([33, 34]);
  });

  it('keeps the blacked-out rows through New Game', async () => {
    const api = renderController();
    await screen.findByRole('group', { name: 'B row' });
    await tap(/^B-3,/);
    await userEvent.click(screen.getByRole('button', { name: 'Black out O row' }));
    await userEvent.click(screen.getByRole('button', { name: 'New Game' }));
    await userEvent.click(screen.getByRole('button', { name: 'Start New Game' }));
    expect(api.current().game.calledNumbers).toEqual([]);
    expect(api.current().game.disabledRows).toEqual(['O']);
  });
});
