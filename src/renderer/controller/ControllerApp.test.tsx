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

  it('shows notices and save failures', async () => {
    const api = renderController(
      makeSnapshot({
        notices: [{ id: 'lost', level: 'warning', message: 'Projector disconnected.' }],
        persistence: { kind: 'error', message: 'Could not save game state: disk full', failedAt: 'now' },
      }),
    );
    expect(await screen.findByText('Projector disconnected.')).toBeInTheDocument();
    expect(screen.getByText(/disk full/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(api.dismissNotice).toHaveBeenCalledWith('lost');
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
