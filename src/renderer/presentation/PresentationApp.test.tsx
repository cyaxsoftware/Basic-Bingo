import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_TIMER } from '../../shared/timer/timerState';
import { createSnapshotStore } from '../shared/snapshotStore';
import { createFakeBingoApi, makeSnapshot } from '../test/fakeBingoApi';
import { PresentationApp } from './PresentationApp';

function renderPresentation(snapshot = makeSnapshot()) {
  const api = createFakeBingoApi(snapshot);
  const store = createSnapshotStore(api);
  const view = render(<PresentationApp store={store} />);
  return { api, view };
}

it('shows the same read-only branding in every Presentation mode', async () => {
  const { api } = renderPresentation();
  await screen.findByRole('main');
  expect(screen.queryByTestId('branding')).toBeNull();
  act(() =>
    api.push(makeSnapshot({ revision: 2, branding: { name: 'Community Bingo Night', logoId: null } })),
  );
  for (const mode of ['gameBoard', 'slideshow', 'singleImage', 'countdown'] as const) {
    await act(async () => {
      await api.setPresentationMode(mode);
    });
    expect(within(screen.getByRole('main')).getByTestId('branding')).toHaveTextContent(
      'Community Bingo Night',
    );
  }
  expect(screen.queryByRole('button')).toBeNull();
});

const played = (number: number, title = 'Four Corners') => ({
  id: `g${number}`,
  number,
  startedAt: 1_700_000_000_000 + number,
  title,
  durationSeconds: 600,
});
const NO_CLOCK = { firstBallAt: null, lastBingoAt: null, resumedAt: null, pausedMs: 0, bingoTitle: null };
const gameNumber = (number?: number) => (_text: string, node: Element | null) =>
  node?.tagName === 'P' &&
  (number === undefined ? /^Game \d+$/.test(node.textContent) : node.textContent === `Game ${number}`);

describe('PresentationApp banner band', () => {
  it('keeps the band on the Game Board with no banner in it, so there is nothing to move later', async () => {
    renderPresentation();
    const slot = await screen.findByTestId('banner-slot');
    expect(slot).toBeEmptyDOMElement();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('puts the banner into that same band when BINGO CALLED is raised, and takes it out again', async () => {
    const { api } = renderPresentation(
      makeSnapshot({ game: { calledNumbers: [3], bingoBannerVisible: false, disabledRows: [] } }),
    );
    const slot = await screen.findByTestId('banner-slot');
    act(() =>
      api.push(
        makeSnapshot({
          revision: 2,
          game: { calledNumbers: [3], bingoBannerVisible: true, disabledRows: [] },
        }),
      ),
    );
    expect(within(slot).getByRole('alert')).toBeInTheDocument();
    expect(screen.getByTestId('banner-slot')).toBe(slot);
    act(() =>
      api.push(
        makeSnapshot({
          revision: 3,
          game: { calledNumbers: [3], bingoBannerVisible: false, disabledRows: [] },
        }),
      ),
    );
    expect(screen.getByTestId('banner-slot')).toBe(slot);
    expect(slot).toBeEmptyDOMElement();
  });

  it('has no band on the other modes, which use the whole screen', async () => {
    renderPresentation(makeSnapshot({ presentationMode: 'countdown' }));
    await screen.findByRole('region', { name: /countdown/i }).catch(() => undefined);
    expect(screen.queryByTestId('banner-slot')).not.toBeInTheDocument();
  });
});

describe('PresentationApp game number', () => {
  it('shows Game 1 on the board before anything is played', async () => {
    renderPresentation();
    expect(await screen.findByText(gameNumber(1))).toBeInTheDocument();
  });

  it('shows the number of the game being played: one more than the last game logged', async () => {
    renderPresentation(
      makeSnapshot({ gameLog: { records: [played(1), played(2), played(3)], current: NO_CLOCK } }),
    );
    expect(await screen.findByText(gameNumber(4))).toBeInTheDocument();
  });

  it('keeps counting from the last logged number when old games have aged out of the list', async () => {
    renderPresentation(makeSnapshot({ gameLog: { records: [played(41), played(42)], current: NO_CLOCK } }));
    expect(await screen.findByText(gameNumber(43))).toBeInTheDocument();
  });

  it('goes under the pattern name once a pattern is pushed, and is not shown twice', async () => {
    const cells = Array.from({ length: 25 }, (_, i) => i % 6 === 0);
    renderPresentation(
      makeSnapshot({
        shownPattern: { title: 'Big L', cells },
        gameLog: { records: [played(1), played(2)], current: NO_CLOCK },
      }),
    );
    const pattern = await screen.findByRole('region', { name: 'Winning pattern' });
    expect(within(pattern).getByText(gameNumber(3))).toBeInTheDocument();
    expect(screen.getAllByText(gameNumber(3))).toHaveLength(1);
    // Under the name: the name is read first, then the number.
    const heading = within(pattern).getByRole('heading', { name: 'Big L' });
    const label = within(pattern).getByText(gameNumber(3));
    expect(heading.compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('takes the board corner again when the pattern is hidden', async () => {
    const { api } = renderPresentation(
      makeSnapshot({ shownPattern: { title: 'Big L', cells: Array.from({ length: 25 }, () => false) } }),
    );
    const pattern = await screen.findByRole('region', { name: 'Winning pattern' });
    expect(within(pattern).getByText(gameNumber(1))).toBeInTheDocument();
    act(() => api.push(makeSnapshot({ revision: 9, shownPattern: null })));
    expect(screen.queryByRole('region', { name: 'Winning pattern' })).not.toBeInTheDocument();
    expect(screen.getAllByText(gameNumber(1))).toHaveLength(1);
  });

  it('is not shown on the other presentation modes', async () => {
    renderPresentation(makeSnapshot({ presentationMode: 'countdown' }));
    await screen.findByRole('region', { name: /countdown/i }).catch(() => undefined);
    expect(screen.queryByText(gameNumber())).not.toBeInTheDocument();
  });

  it('is plain text with no controls', async () => {
    renderPresentation();
    const label = await screen.findByText(gameNumber(1));
    expect(label.querySelector('button, a, input')).toBeNull();
  });
});

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

  it('shows the Slideshow placeholder and countdown when no collection is selected', async () => {
    renderPresentation(makeSnapshot({ presentationMode: 'slideshow' }));
    expect(await screen.findByRole('region', { name: 'Slideshow' })).toBeInTheDocument();
    expect(screen.getByText('No slideshow selected')).toBeInTheDocument();
    expect(screen.getByRole('timer')).toHaveTextContent('05:00');
    expect(screen.queryByLabelText('Bingo board')).not.toBeInTheDocument();
  });

  it('follows the slideshow slide and fit through expiry, with a read-only corner countdown', async () => {
    const legacy = {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      name: 'Sponsor.png',
      format: 'png',
      bytes: 100,
      width: 400,
      height: 200,
      addedAt: '',
      fit: 'original',
    } as const;
    const owned = { ...legacy, id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'Menu.png' };
    const snapshot = makeSnapshot({
      presentationMode: 'slideshow',
      mediaLibrary: [legacy],
      timer: { ...DEFAULT_TIMER, status: 'paused', remainingMs: 2150 },
      slideshow: {
        activeId: 'sponsors',
        collections: [
          {
            id: 'sponsors',
            name: 'Sponsors',
            fit: 'fill',
            secondsPerSlide: 3,
            slides: [
              { mediaId: legacy.id, fit: null },
              { mediaId: owned.id, image: owned, fit: 'original' },
            ],
          },
        ],
      },
    });
    const { api } = renderPresentation(snapshot);
    const image = await screen.findByRole('region', { name: 'Slideshow image' });
    expect(within(image).getByRole('img')).toHaveAccessibleName('Sponsor.png');
    expect(image).toHaveAttribute('data-fit', 'fill');
    const overlay = within(screen.getByRole('group', { name: 'Break countdown' }));
    expect(overlay.getByRole('timer')).toHaveTextContent('00:03');
    expect(overlay.getByText('Paused')).toBeInTheDocument();

    act(() =>
      api.push({
        ...snapshot,
        revision: 2,
        slideshowPlayback: { status: 'held', mediaId: owned.id },
        timer: { ...DEFAULT_TIMER, status: 'expired' },
      }),
    );
    const held = screen.getByRole('region', { name: 'Slideshow image' });
    expect(held).toHaveAttribute('data-fit', 'original');
    expect(within(held).getByRole('img')).toHaveAccessibleName('Menu.png');
    expect(overlay.getByText('Time to Play!')).toBeInTheDocument();
    act(() =>
      api.push({
        ...api.current(),
        revision: 3,
        slideshowPlayback: { status: 'playing', mediaId: legacy.id, advanceAt: 1234 },
      }),
    );
    expect(screen.getByRole('img')).toHaveAccessibleName('Sponsor.png');
    expect(overlay.getByText('Time to Play!')).toBeInTheDocument();
    expect(screen.queryAllByRole('button')).toHaveLength(0);

    act(() =>
      api.push({
        ...api.current(),
        revision: 4,
        slideshow: { ...snapshot.slideshow, showCountdown: false },
      }),
    );
    expect(screen.queryByRole('group', { name: 'Break countdown' })).toBeNull();
    expect(screen.getByRole('img')).toHaveAccessibleName('Sponsor.png');
    act(() =>
      api.push({
        ...api.current(),
        revision: 5,
        slideshow: { ...snapshot.slideshow, showCountdown: true },
      }),
    );
    expect(screen.getByText('Time to Play!')).toBeInTheDocument();
  });

  it('shows the empty collection placeholder', async () => {
    renderPresentation(
      makeSnapshot({
        presentationMode: 'slideshow',
        slideshow: {
          activeId: 'empty',
          collections: [{ id: 'empty', name: 'Empty', slides: [], fit: 'fit', secondsPerSlide: 10 }],
        },
      }),
    );
    expect(await screen.findByText('No slides in this collection')).toBeInTheDocument();
  });

  describe('Countdown', () => {
    it('shows the idle duration and message, with a read-only stage', async () => {
      renderPresentation(makeSnapshot({ presentationMode: 'countdown' }));
      const stage = within(await screen.findByRole('region', { name: 'Countdown' }));
      expect(stage.getByText(DEFAULT_TIMER.message)).toBeInTheDocument();
      expect(stage.getByRole('timer')).toHaveTextContent('05:00');
      expect(stage.queryByText('Paused')).toBeNull();
      expect(screen.queryAllByRole('button')).toHaveLength(0);
      expect(document.querySelectorAll('input, select, textarea, a[href], [tabindex]')).toHaveLength(0);
    });

    it('holds the paused remainder and hides the timer on every other mode', async () => {
      const timer = {
        ...DEFAULT_TIMER,
        message: 'Next round',
        status: 'paused',
        remainingMs: 59_801,
      } as const;
      const { api } = renderPresentation(makeSnapshot({ presentationMode: 'countdown', timer }));
      expect(await screen.findByRole('timer')).toHaveTextContent('01:00');
      expect(screen.getByText('Next round')).toBeInTheDocument();
      expect(screen.getByText('Paused')).toBeInTheDocument();

      for (const mode of ['gameBoard', 'singleImage'] as const) {
        act(() =>
          api.push({ ...api.current(), revision: api.current().revision + 1, presentationMode: mode }),
        );
        expect(screen.queryByRole('timer')).toBeNull();
      }
      act(() =>
        api.push({ ...api.current(), revision: api.current().revision + 1, presentationMode: 'countdown' }),
      );
      expect(screen.getByRole('timer')).toHaveTextContent('01:00');
      expect(screen.getByText('Paused')).toBeInTheDocument();
    });

    it('ticks from the running target and shows Time to Play at zero and on later expired snapshots', async () => {
      vi.useFakeTimers();
      try {
        const { api } = renderPresentation(
          makeSnapshot({
            presentationMode: 'countdown',
            timer: { ...DEFAULT_TIMER, durationSeconds: 2, status: 'running', targetAt: Date.now() + 2000 },
          }),
        );
        await act(async () => {});
        expect(screen.getByRole('timer')).toHaveTextContent('00:02');
        act(() => vi.advanceTimersByTime(1750));
        expect(screen.getByRole('timer')).toHaveTextContent('00:01');
        act(() => vi.advanceTimersByTime(250));
        expect(screen.getByText('Time to Play!')).toBeInTheDocument();
        expect(screen.queryByRole('timer')).toBeNull();
        act(() =>
          api.push({ ...api.current(), revision: 2, timer: { ...DEFAULT_TIMER, status: 'expired' } }),
        );
        expect(screen.getByText('Time to Play!')).toBeInTheDocument();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  it('returns to the board with the game intact after a mode change', async () => {
    const calls = { calledNumbers: [3, 17, 9], bingoBannerVisible: false, disabledRows: [] };
    const { api } = renderPresentation(makeSnapshot({ game: calls, presentationMode: 'slideshow' }));
    await screen.findByRole('region', { name: 'Slideshow' });

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
      expect(screen.getByRole('region', { name: 'Slideshow' })).toBeInTheDocument();

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

  describe('Single Image mode', () => {
    const ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const ID_2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const entry = (id: string, name: string) => ({
      id,
      name,
      format: 'png' as const,
      bytes: 1000,
      width: 800,
      height: 400,
      addedAt: '2026-01-01T00:00:00.000Z',
      fit: 'fit' as const,
    });
    const single = (overrides: Parameters<typeof makeSnapshot>[0] = {}) =>
      makeSnapshot({
        presentationMode: 'singleImage',
        mediaLibrary: [entry(ID, 'Sponsors.png'), entry(ID_2, 'Menu.png')],
        singleImage: { imageId: ID },
        ...overrides,
      });
    const stage = () => screen.getByRole('region', { name: 'Single image' });

    it('shows exactly the chosen image from the library, and nothing else', async () => {
      renderPresentation(single());
      const view = await screen.findByRole('region', { name: 'Single image' });
      const picture = within(view).getByRole('img', { name: 'Sponsors.png' });
      expect(picture).toHaveAttribute('src', `bingo-media://${ID}`);
      expect(view).toHaveAttribute('data-state', 'image');
      // No board, no calls, no countdown, no controls.
      expect(screen.queryByTestId('board-ball-1')).toBeNull();
      expect(screen.queryByText(/Time to Play/i)).toBeNull();
      expect(screen.queryAllByRole('button')).toHaveLength(0);
    });

    it('fits, fills or shows at original size, as the image is set', async () => {
      const { api } = renderPresentation(single());
      await screen.findByRole('region', { name: 'Single image' });
      expect(stage()).toHaveAttribute('data-fit', 'fit');
      for (const [revision, fit] of [
        [2, 'fill'],
        [3, 'original'],
        [4, 'fit'],
      ] as const) {
        act(() =>
          api.push(
            single({
              revision,
              mediaLibrary: [{ ...entry(ID, 'Sponsors.png'), fit }, entry(ID_2, 'Menu.png')],
            }),
          ),
        );
        expect(stage()).toHaveAttribute('data-fit', fit);
      }
    });

    it('each image uses its own setting', async () => {
      const library = [
        { ...entry(ID, 'Sponsors.png'), fit: 'fill' as const },
        { ...entry(ID_2, 'Menu.png'), fit: 'original' as const },
      ];
      const { api } = renderPresentation(single({ mediaLibrary: library }));
      await screen.findByRole('img', { name: 'Sponsors.png' });
      expect(stage()).toHaveAttribute('data-fit', 'fill');
      act(() => api.push(single({ revision: 2, mediaLibrary: library, singleImage: { imageId: ID_2 } })));
      expect(stage()).toHaveAttribute('data-fit', 'original');
    });

    it('follows the operator to another image', async () => {
      const { api } = renderPresentation(single());
      await screen.findByRole('img', { name: 'Sponsors.png' });
      act(() => api.push(single({ revision: 2, singleImage: { imageId: ID_2 } })));
      expect(screen.getByRole('img', { name: 'Menu.png' })).toHaveAttribute('src', `bingo-media://${ID_2}`);
      expect(screen.queryByRole('img', { name: 'Sponsors.png' })).toBeNull();
    });

    it('shows a calm message, not a broken icon, when no image is chosen', async () => {
      renderPresentation(single({ singleImage: { imageId: null } }));
      const view = await screen.findByRole('region', { name: 'Single image' });
      expect(view).toHaveAttribute('data-state', 'none');
      expect(within(view).getByText('No image selected')).toBeInTheDocument();
      expect(within(view).queryByRole('img')).toBeNull();
    });

    it('shows the same message when the chosen image is no longer in the library', async () => {
      renderPresentation(single({ mediaLibrary: [], singleImage: { imageId: ID } }));
      expect(await screen.findByText('No image selected')).toBeInTheDocument();
    });

    it('shows "Image unavailable" if the file cannot be loaded, and tries again for the next image', async () => {
      const { api } = renderPresentation(single());
      fireEvent.error(await screen.findByRole('img', { name: 'Sponsors.png' }));
      expect(stage()).toHaveAttribute('data-state', 'unavailable');
      expect(screen.getByText('Image unavailable')).toBeInTheDocument();
      expect(screen.queryByRole('img')).toBeNull();

      act(() => api.push(single({ revision: 2, singleImage: { imageId: ID_2 } })));
      expect(screen.getByRole('img', { name: 'Menu.png' })).toBeInTheDocument();
      expect(stage()).toHaveAttribute('data-state', 'image');
    });

    it('keeps the game and the BINGO banner untouched: the banner returns with the board', async () => {
      const game = { calledNumbers: [3, 17, 9], bingoBannerVisible: true, disabledRows: [] };
      const { api } = renderPresentation(single({ game }));
      await screen.findByRole('img', { name: 'Sponsors.png' });
      // The banner belongs to the board; in this mode it is not shown.
      expect(screen.queryByRole('alert')).toBeNull();

      act(() => api.push(makeSnapshot({ revision: 2, game, presentationMode: 'gameBoard' })));
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByRole('img', { name: 'B-9' })).toBeInTheDocument();
    });
  });
});
