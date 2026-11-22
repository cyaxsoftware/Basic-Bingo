import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
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
  });

  it('offers Preview only when there is no second display', async () => {
    const api = renderController(makeSnapshot({ displays: [LAPTOP] }));
    expect(await screen.findByText(/No second display/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Project' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(api.openPreview).toHaveBeenCalled();
    expect(await screen.findByRole('status')).toHaveTextContent('Preview window open');
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
});
