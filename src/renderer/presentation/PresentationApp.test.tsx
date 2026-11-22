import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createSnapshotStore } from '../shared/snapshotStore';
import { createFakeBingoApi, makeSnapshot } from '../test/fakeBingoApi';
import { PresentationApp } from './PresentationApp';

function renderPresentation(snapshot = makeSnapshot()) {
  const api = createFakeBingoApi(snapshot);
  const store = createSnapshotStore(api);
  const view = render(<PresentationApp store={store} />);
  return { api, view };
}

describe('PresentationApp', () => {
  it('shows a calm empty state before the first call', async () => {
    renderPresentation();
    expect(await screen.findByText('Ready for first call')).toBeInTheDocument();
  });

  it('shows the latest state immediately on open', async () => {
    renderPresentation(makeSnapshot({ revision: 7, game: { calledNumbers: [3, 17, 9] } }));
    expect(await screen.findByRole('img', { name: 'B-9' })).toBeInTheDocument();
    const previous = screen.getByRole('list', { name: 'Previous calls' });
    expect(previous).toHaveTextContent(/17.*3/);
    expect(screen.getByTestId('board-ball-9')).toHaveAttribute('data-status', 'current');
    expect(screen.getByTestId('board-ball-3')).toHaveAttribute('data-status', 'called');
    expect(screen.getByTestId('board-ball-4')).toHaveAttribute('data-status', 'uncalled');
  });

  it('updates when main publishes a newer snapshot', async () => {
    const { api } = renderPresentation();
    await screen.findByText('Ready for first call');
    act(() => api.push(makeSnapshot({ revision: 2, game: { calledNumbers: [3] } })));
    expect(screen.getByRole('img', { name: 'B-3' })).toBeInTheDocument();
    expect(screen.queryByText('Ready for first call')).not.toBeInTheDocument();
  });

  it('has no interactive controls', async () => {
    renderPresentation(makeSnapshot({ game: { calledNumbers: [1, 2, 3] } }));
    await screen.findByRole('img', { name: 'B-3' });
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(document.querySelectorAll('input, select, textarea, a[href]')).toHaveLength(0);
  });
});
