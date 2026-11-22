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
    renderPresentation(
      makeSnapshot({ revision: 7, game: { calledNumbers: [3, 17, 9], bingoBannerVisible: false } }),
    );
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
    act(() =>
      api.push(makeSnapshot({ revision: 2, game: { calledNumbers: [3], bingoBannerVisible: false } })),
    );
    expect(screen.getByRole('img', { name: 'B-3' })).toBeInTheDocument();
    expect(screen.queryByText('Ready for first call')).not.toBeInTheDocument();
  });

  it('shows a calm placeholder, not a blank screen, for modes that arrive in milestone 4', async () => {
    const { api } = renderPresentation(makeSnapshot({ presentationMode: 'slideshow' }));
    expect(await screen.findByRole('heading', { name: 'Break Slideshow' })).toBeInTheDocument();
    expect(screen.getByText('Coming soon')).toBeInTheDocument();
    expect(screen.queryByLabelText('Bingo board')).not.toBeInTheDocument();

    act(() => api.push(makeSnapshot({ revision: 2, presentationMode: 'countdown' })));
    expect(screen.getByRole('heading', { name: 'Countdown' })).toBeInTheDocument();
  });

  it('returns to the board with the game intact after a mode change', async () => {
    const calls = { calledNumbers: [3, 17, 9], bingoBannerVisible: false };
    const { api } = renderPresentation(makeSnapshot({ game: calls, presentationMode: 'singleImage' }));
    await screen.findByRole('heading', { name: 'Single Image' });

    act(() => api.push(makeSnapshot({ revision: 2, game: calls, presentationMode: 'gameBoard' })));
    expect(screen.getByRole('img', { name: 'B-9' })).toBeInTheDocument();
    expect(screen.getByTestId('board-ball-3')).toHaveAttribute('data-status', 'called');
  });

  describe('BINGO banner', () => {
    const BANNER = 'BINGO CALLED — PLEASE HOLD YOUR CARDS';
    const game = (bingoBannerVisible: boolean) => ({ calledNumbers: [3, 17, 9], bingoBannerVisible });

    it('is absent until the operator raises it', async () => {
      renderPresentation(makeSnapshot({ game: game(false) }));
      await screen.findByRole('img', { name: 'B-9' });
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.queryByText(BANNER)).not.toBeInTheDocument();
    });

    it('appears and disappears with the game state, leaving the board and calls untouched', async () => {
      const { api } = renderPresentation(makeSnapshot({ revision: 1, game: game(false) }));
      await screen.findByRole('img', { name: 'B-9' });

      act(() => api.push(makeSnapshot({ revision: 2, game: game(true) })));
      expect(screen.getByRole('alert')).toHaveTextContent(BANNER);
      // Board context stays visible with the banner up.
      expect(screen.getByRole('img', { name: 'B-9' })).toBeInTheDocument();
      expect(screen.getByLabelText('Bingo board')).toBeInTheDocument();
      expect(screen.getByTestId('board-ball-3')).toHaveAttribute('data-status', 'called');

      act(() => api.push(makeSnapshot({ revision: 3, game: game(false) })));
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.getByRole('img', { name: 'B-9' })).toBeInTheDocument();
    });

    it('stays up across later snapshots (new calls, redraws) until the flag clears', async () => {
      const { api } = renderPresentation(makeSnapshot({ revision: 1, game: game(true) }));
      expect(await screen.findByRole('alert')).toHaveTextContent(BANNER);

      act(() =>
        api.push(
          makeSnapshot({ revision: 2, game: { calledNumbers: [3, 17, 9, 40], bingoBannerVisible: true } }),
        ),
      );
      act(() => api.push(makeSnapshot({ revision: 3, game: game(true), presentation: { kind: 'preview' } })));
      expect(screen.getByRole('alert')).toHaveTextContent(BANNER);
    });

    it('is shown on first render when the app starts or the window reopens with the flag set', async () => {
      renderPresentation(makeSnapshot({ game: game(true) }));
      expect(await screen.findByRole('alert')).toHaveTextContent(BANNER);
    });

    it('is not drawn over other modes but returns with the board, because the flag is untouched', async () => {
      const { api } = renderPresentation(makeSnapshot({ revision: 1, game: game(true) }));
      await screen.findByRole('alert');

      act(() => api.push(makeSnapshot({ revision: 2, game: game(true), presentationMode: 'slideshow' })));
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Break Slideshow' })).toBeInTheDocument();

      act(() => api.push(makeSnapshot({ revision: 3, game: game(true), presentationMode: 'gameBoard' })));
      expect(screen.getByRole('alert')).toHaveTextContent(BANNER);
    });

    it('adds no controls', async () => {
      renderPresentation(makeSnapshot({ game: game(true) }));
      await screen.findByRole('alert');
      expect(screen.queryAllByRole('button')).toHaveLength(0);
      expect(document.querySelectorAll('input, select, textarea, a[href], [tabindex]')).toHaveLength(0);
    });
  });

  it('has no interactive controls', async () => {
    renderPresentation(makeSnapshot({ game: { calledNumbers: [1, 2, 3], bingoBannerVisible: false } }));
    await screen.findByRole('img', { name: 'B-3' });
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(document.querySelectorAll('input, select, textarea, a[href]')).toHaveLength(0);
  });
});
