import { act, render, screen, within } from '@testing-library/react';
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
      makeSnapshot({
        revision: 7,
        game: { calledNumbers: [3, 17, 9], bingoBannerVisible: false, disabledRows: [] },
      }),
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
      api.push(
        makeSnapshot({
          revision: 2,
          game: { calledNumbers: [3], bingoBannerVisible: false, disabledRows: [] },
        }),
      ),
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
    const calls = { calledNumbers: [3, 17, 9], bingoBannerVisible: false, disabledRows: [] };
    const { api } = renderPresentation(makeSnapshot({ game: calls, presentationMode: 'singleImage' }));
    await screen.findByRole('heading', { name: 'Single Image' });

    act(() => api.push(makeSnapshot({ revision: 2, game: calls, presentationMode: 'gameBoard' })));
    expect(screen.getByRole('img', { name: 'B-9' })).toBeInTheDocument();
    expect(screen.getByTestId('board-ball-3')).toHaveAttribute('data-status', 'called');
  });

  describe('BINGO banner', () => {
    const BANNER = 'BINGO CALLED — PLEASE HOLD YOUR CARDS';
    const game = (bingoBannerVisible: boolean) => ({
      calledNumbers: [3, 17, 9],
      bingoBannerVisible,
      disabledRows: [],
    });

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
          makeSnapshot({
            revision: 2,
            game: { calledNumbers: [3, 17, 9, 40], bingoBannerVisible: true, disabledRows: [] },
          }),
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
    renderPresentation(
      makeSnapshot({ game: { calledNumbers: [1, 2, 3], bingoBannerVisible: false, disabledRows: [] } }),
    );
    await screen.findByRole('img', { name: 'B-3' });
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(document.querySelectorAll('input, select, textarea, a[href]')).toHaveLength(0);
  });

  describe('the pushed pattern', () => {
    const shown = { title: 'Crazy Y', cells: [true, ...Array<boolean>(23).fill(false), true] };

    it('shows nothing about a pattern until the operator pushes one', async () => {
      renderPresentation();
      await screen.findByText('Ready for first call');
      expect(screen.queryByRole('region', { name: 'Winning pattern' })).toBeNull();
    });

    it('shows the pushed title and exactly the lit squares, with no free center', async () => {
      renderPresentation(makeSnapshot({ shownPattern: shown }));
      const panel = await screen.findByRole('region', { name: 'Winning pattern' });
      expect(within(panel).getByRole('heading', { name: 'Crazy Y' })).toBeInTheDocument();
      expect(within(panel).getByRole('img', { name: 'Crazy Y: 2 of 25 squares' })).toBeInTheDocument();
      for (let index = 0; index < 25; index++) {
        const lit = index === 0 || index === 24;
        expect(screen.getByTestId(`pattern-cell-${index}`)).toHaveAttribute('data-on', String(lit));
      }
      expect(screen.getByTestId('pattern-cell-12')).toHaveAttribute('data-on', 'false');
    });

    it('follows the pushed pattern, not the working copy', async () => {
      const { api } = renderPresentation(makeSnapshot({ shownPattern: shown }));
      await screen.findByRole('region', { name: 'Winning pattern' });
      act(() =>
        api.push(
          makeSnapshot({
            revision: 2,
            shownPattern: shown,
            activePattern: {
              sourcePatternId: null,
              title: 'Edited later',
              cells: Array(25).fill(true),
              editedFromLibrary: false,
            },
          }),
        ),
      );
      expect(screen.getByRole('heading', { name: 'Crazy Y' })).toBeInTheDocument();
      expect(screen.queryByText('Edited later')).toBeNull();
      expect(screen.getByTestId('pattern-cell-12')).toHaveAttribute('data-on', 'false');
    });

    it('updates when a new pattern is pushed, and goes away when hidden', async () => {
      const { api } = renderPresentation(makeSnapshot({ shownPattern: shown }));
      await screen.findByRole('region', { name: 'Winning pattern' });
      act(() =>
        api.push(
          makeSnapshot({ revision: 2, shownPattern: { title: 'Blackout', cells: Array(25).fill(true) } }),
        ),
      );
      expect(screen.getByRole('heading', { name: 'Blackout' })).toBeInTheDocument();
      act(() => api.push(makeSnapshot({ revision: 3, shownPattern: null })));
      expect(screen.queryByRole('region', { name: 'Winning pattern' })).toBeNull();
    });

    it('stays read-only: no controls were added', async () => {
      renderPresentation(makeSnapshot({ shownPattern: shown }));
      await screen.findByRole('region', { name: 'Winning pattern' });
      expect(screen.queryAllByRole('button')).toHaveLength(0);
    });
  });

  describe('blacked-out rows', () => {
    const rowOut = (letter: string) =>
      screen.getByTestId(`board-row-${letter}`).getAttribute('data-disabled');

    it('shows every row in play until the operator blacks one out', async () => {
      renderPresentation();
      await screen.findByText('Ready for first call');
      for (const letter of ['B', 'I', 'N', 'G', 'O']) expect(rowOut(letter)).toBe('false');
    });

    it('marks exactly the blacked-out rows, and follows changes', async () => {
      const game = (disabledRows: ('B' | 'I' | 'N' | 'G' | 'O')[]) => ({
        calledNumbers: [3, 17],
        bingoBannerVisible: false,
        disabledRows,
      });
      const { api } = renderPresentation(makeSnapshot({ game: game(['I', 'O']) }));
      await screen.findByTestId('board-row-I');
      expect(['B', 'I', 'N', 'G', 'O'].map(rowOut)).toEqual(['false', 'true', 'false', 'false', 'true']);

      act(() => api.push(makeSnapshot({ revision: 2, game: game([]) })));
      expect(['B', 'I', 'N', 'G', 'O'].map(rowOut)).toEqual(['false', 'false', 'false', 'false', 'false']);
    });

    it('still shows called balls, and the current call, from a blacked-out row', async () => {
      renderPresentation(
        makeSnapshot({ game: { calledNumbers: [3, 17], bingoBannerVisible: false, disabledRows: ['I'] } }),
      );
      expect(await screen.findByRole('img', { name: 'I-17' })).toBeInTheDocument();
      expect(screen.getByTestId('board-ball-17')).toHaveAttribute('data-status', 'current');
    });

    it('stays read-only: no controls were added for it', async () => {
      renderPresentation(
        makeSnapshot({ game: { calledNumbers: [], bingoBannerVisible: false, disabledRows: ['B'] } }),
      );
      await screen.findByTestId('board-row-B');
      expect(screen.queryAllByRole('button')).toHaveLength(0);
    });
  });
});
