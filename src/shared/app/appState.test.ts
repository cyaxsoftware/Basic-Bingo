import { describe, expect, it } from 'vitest';
import type { MediaItem } from '../media';
import type { SlideshowCollection } from '../media/slideshow';
import {
  createInitialAppState,
  reduceAppState,
  type AppCommand,
  type AppState,
  type AppStateContext,
} from './appState';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const SPONSORS = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const RAFFLE = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const START = Date.UTC(2026, 10, 22, 19, 0, 0);

function image(id: string): MediaItem {
  return {
    id,
    name: `${id.slice(0, 1)}.png`,
    format: 'png',
    bytes: 1000,
    width: 1920,
    height: 1080,
    addedAt: '2026-11-01T00:00:00.000Z',
    fit: 'fit',
  };
}

function collection(id: string, mediaIds: readonly string[], secondsPerSlide = 10): SlideshowCollection {
  return {
    id,
    name: 'Sponsors',
    secondsPerSlide,
    fit: 'fit',
    slides: mediaIds.map((mediaId) => ({ mediaId, fit: null })),
  };
}

/** Library images A and B; the Sponsors collection shows A then B and is active; Raffle shows B. */
function withSlideshow(overrides: Partial<AppState> = {}): AppState {
  return {
    ...createInitialAppState(),
    mediaLibrary: [image(A), image(B)],
    slideshow: { activeId: SPONSORS, collections: [collection(SPONSORS, [A, B]), collection(RAFFLE, [B])] },
    presentationMode: 'slideshow',
    ...overrides,
  };
}

/** Runs commands one after another with a clock the test moves, failing the test on the first refusal. */
function session(initial: AppState = createInitialAppState()) {
  let state = initial;
  let nowMs = START;
  let ids = 0;
  const context = (): AppStateContext => ({
    now: new Date(nowMs),
    newId: () => `00000000-0000-4000-8000-${String(++ids).padStart(12, '0')}`,
  });
  return {
    run(...commands: AppCommand[]): AppState {
      for (const command of commands) {
        const result = reduceAppState(state, command, context());
        if (!result.ok) throw new Error(`Refused ${command.area}: ${result.error}`);
        state = result.state;
      }
      return state;
    },
    attempt: (command: AppCommand) => reduceAppState(state, command, context()),
    wait(seconds: number) {
      nowMs += seconds * 1000;
    },
    get state() {
      return state;
    },
  };
}

const ball = (n: number): AppCommand => ({ area: 'game', command: { type: 'toggleBall', ball: n } });
const bingo: AppCommand = { area: 'game', command: { type: 'showBingoBanner' } };
const newGame: AppCommand = { area: 'game', command: { type: 'newGame' } };
const playback = (command: Extract<AppCommand, { area: 'playback' }>['command']): AppCommand => ({
  area: 'playback',
  command,
});

describe('reduceAppState', () => {
  describe('a command that changes nothing returns the same state', () => {
    const cases: [string, AppState, AppCommand][] = [
      ['game', createInitialAppState(), { area: 'game', command: { type: 'dismissBingoBanner' } }],
      ['games log', createInitialAppState(), { area: 'gameLog', command: { type: 'clear' } }],
      [
        'patterns',
        createInitialAppState(),
        { area: 'patterns', command: { type: 'hidePatternOnProjector' } },
      ],
      [
        'media',
        createInitialAppState(),
        { area: 'media', command: { type: 'selectSingleImage', mediaId: null } },
      ],
      [
        'media: an empty import',
        createInitialAppState(),
        { area: 'media', command: { type: 'addMedia', items: [] } },
      ],
      [
        'slideshow',
        withSlideshow(),
        { area: 'slideshow', command: { type: 'select', collectionId: SPONSORS } },
      ],
      [
        'slideshow: an empty import',
        withSlideshow(),
        { area: 'slideshow', command: { type: 'addImages', collectionId: SPONSORS, images: [] } },
      ],
      ['playback', withSlideshow(), { area: 'playback', command: { type: 'stop' } }],
      [
        'playback: a deadline while stopped',
        withSlideshow(),
        { area: 'playback', command: { type: 'advance', deadline: START } },
      ],
      ['timer', createInitialAppState(), { area: 'timer', command: { type: 'reset' } }],
      [
        'presentation mode',
        createInitialAppState(),
        { area: 'presentationMode', command: { type: 'setMode', mode: 'gameBoard' } },
      ],
      [
        'settings: theme',
        createInitialAppState(),
        { area: 'settings', command: { type: 'setControllerTheme', theme: 'light' } },
      ],
      [
        'settings: display',
        createInitialAppState(),
        { area: 'settings', command: { type: 'setPreferredDisplay', displayId: null } },
      ],
    ];
    it.each(cases)('%s', (_area, state, command) => {
      const result = reduceAppState(state, command, { now: new Date(START), newId: () => 'unused' });
      expect(result).toEqual({ ok: true, state });
      expect(result.ok && result.state).toBe(state);
    });
  });

  it('refuses a command with the reason and changes nothing, never throwing', () => {
    const state = createInitialAppState();
    expect(reduceAppState(state, ball(76), { now: new Date(START), newId: () => 'x' })).toEqual({
      ok: false,
      error: expect.stringMatching(/76/),
    });
    expect(
      reduceAppState(
        state,
        { area: 'media', command: { type: 'removeMedia', mediaId: A } },
        {
          now: new Date(START),
          newId: () => 'x',
        },
      ),
    ).toEqual({ ok: false, error: 'That image is not in the library.' });
  });

  it('carries fields it does not know through untouched, so the store can pass its whole snapshot', () => {
    const snapshot = { ...createInitialAppState(), revision: 7, notices: ['kept'] };
    const result = reduceAppState(snapshot, ball(3), { now: new Date(START), newId: () => 'x' });
    expect(result.ok && result.state).toMatchObject({ revision: 7, notices: ['kept'] });
    expect(result.ok && result.state.game.calledNumbers).toEqual([3]);
  });

  describe('the game and the games-played log', () => {
    it('times a game from its first ball with the same clock, and logs it with the working pattern on New Game', () => {
      const s = session();
      s.run({ area: 'patterns', command: { type: 'renameActivePattern', title: 'Four corners' } });
      s.run(ball(3));
      expect(s.state.gameLog.current.firstBallAt).toBe(START);
      s.wait(90);
      s.run(ball(17), bingo);
      s.wait(30);
      s.run({ area: 'game', command: { type: 'dismissBingoBanner' } }, newGame);
      expect(s.state.game.calledNumbers).toEqual([]);
      expect(s.state.gameLog.records).toEqual([
        { id: expect.any(String), number: 1, startedAt: START, title: 'Four corners', durationSeconds: 90 },
      ]);
    });

    it('logs nothing for a refused game command', () => {
      const s = session();
      s.run(ball(3), bingo);
      const before = s.state;
      expect(s.attempt(ball(4)).ok).toBe(false);
      expect(s.state).toBe(before);
    });

    it('clearing the history keeps the game in progress timed', () => {
      const s = session();
      s.run(ball(3), newGame, ball(5));
      expect(s.state.gameLog.records).toHaveLength(1);
      s.run({ area: 'gameLog', command: { type: 'clear' } });
      expect(s.state.gameLog.records).toEqual([]);
      expect(s.state.gameLog.current.firstBallAt).toBe(START);
    });

    it('leaves the checking time of a false bingo out of the duration', () => {
      const s = session();
      s.run(ball(5));
      s.wait(60);
      s.run(bingo); // false: play carries on
      s.wait(10);
      s.run({ area: 'game', command: { type: 'dismissBingoBanner' } }, ball(6));
      s.wait(50);
      s.run(bingo, newGame);
      // 120 s of wall time, minus the 10 s the false bingo was up.
      expect(s.state.gameLog.records[0]?.durationSeconds).toBe(110);
    });

    it('ends the game when New Game is confirmed if BINGO CALLED was never pressed', () => {
      const s = session();
      s.run(ball(5));
      s.wait(90);
      s.run(ball(17));
      s.wait(45);
      s.run(newGame);
      expect(s.state.gameLog.records[0]?.durationSeconds).toBe(135);
    });

    it('does not log a New Game with no calls', () => {
      const s = session();
      const before = s.state.gameLog;
      s.run(newGame);
      expect(s.state.gameLog).toBe(before);
    });

    it('a new game keeps the working pattern with its edits, the library and the presentation mode', () => {
      const s = session();
      s.run(
        { area: 'patterns', command: { type: 'selectPattern', patternId: 'seed-big-l' } },
        { area: 'patterns', command: { type: 'setActivePatternCell', index: 12, on: true } },
        { area: 'patterns', command: { type: 'renameActivePattern', title: 'Big L plus' } },
        { area: 'presentationMode', command: { type: 'setMode', mode: 'slideshow' } },
        ball(7),
        bingo,
      );
      const before = s.state;
      s.run(newGame);
      expect(s.state.game).toEqual({ calledNumbers: [], bingoBannerVisible: false, disabledRows: [] });
      expect(s.state.activePattern).toBe(before.activePattern);
      expect(s.state.activePattern).toMatchObject({ title: 'Big L plus', editedFromLibrary: true });
      expect(s.state.patternLibrary).toBe(before.patternLibrary);
      expect(s.state.presentationMode).toBe('slideshow');
    });

    it('mode switches, pattern, media and timer commands never touch the game or its log', () => {
      const s = session(withSlideshow({ presentationMode: 'gameBoard' }));
      s.run(ball(3), bingo);
      const { game, gameLog } = s.state;
      s.run(
        ...(['slideshow', 'singleImage', 'countdown', 'gameBoard'] as const).map((mode): AppCommand => ({
          area: 'presentationMode',
          command: { type: 'setMode', mode },
        })),
        { area: 'patterns', command: { type: 'selectPattern', patternId: 'seed-four-corners' } },
        { area: 'media', command: { type: 'selectSingleImage', mediaId: A } },
        { area: 'timer', command: { type: 'start' } },
      );
      expect(s.state.game).toBe(game);
      expect(s.state.gameLog).toBe(gameLog);
    });

    it('the game, patterns and mode switches never touch media, and patterns never change the mode', () => {
      const s = session(withSlideshow({ presentationMode: 'slideshow' }));
      s.run({ area: 'media', command: { type: 'selectSingleImage', mediaId: A } });
      const { mediaLibrary, singleImage } = s.state;
      s.run(ball(7), newGame, {
        area: 'patterns',
        command: { type: 'selectPattern', patternId: 'seed-big-l' },
      });
      expect(s.state.presentationMode).toBe('slideshow');
      const { activePattern } = s.state;
      s.run({ area: 'presentationMode', command: { type: 'setMode', mode: 'singleImage' } });
      expect(s.state.activePattern).toBe(activePattern);
      expect(s.state.mediaLibrary).toBe(mediaLibrary);
      expect(s.state.singleImage).toBe(singleImage);
    });
  });

  it('stamps patterns with the context clock and ids', () => {
    const s = session();
    s.run({
      area: 'patterns',
      command: { type: 'createPattern', title: 'Blackout', cells: Array<boolean>(25).fill(true) },
    });
    const created = s.state.patternLibrary.at(-1);
    expect(created).toMatchObject({
      id: '00000000-0000-4000-8000-000000000001',
      title: 'Blackout',
      createdAt: new Date(START).toISOString(),
    });
  });

  describe('removing a library image', () => {
    it('drops its slides in the same change, and stops playback that was showing it', () => {
      const s = session(withSlideshow());
      s.run(playback({ type: 'start' }));
      expect(s.state.slideshowPlayback).toMatchObject({ status: 'playing', mediaId: A });
      s.run({ area: 'media', command: { type: 'removeMedia', mediaId: A } });
      expect(s.state.mediaLibrary.map(({ id }) => id)).toEqual([B]);
      expect(s.state.slideshow.collections.map(({ slides }) => slides.map(({ mediaId }) => mediaId))).toEqual(
        [[B], [B]],
      );
      expect(s.state.slideshowPlayback).toEqual({ status: 'stopped', mediaId: null });
    });

    it('leaves playback alone when the slide showing is not the one removed', () => {
      const s = session(withSlideshow());
      s.run(playback({ type: 'hold', mediaId: B }));
      const held = s.state.slideshowPlayback;
      s.run({ area: 'media', command: { type: 'removeMedia', mediaId: A } });
      expect(s.state.slideshowPlayback).toBe(held);
    });

    it('leaves the slideshow alone when no collection used it', () => {
      const s = session(withSlideshow({ mediaLibrary: [image(A), image(B), image(C)] }));
      const { slideshow } = s.state;
      s.run({ area: 'media', command: { type: 'removeMedia', mediaId: C } });
      expect(s.state.slideshow).toBe(slideshow);
    });
  });

  describe('slideshow changes reconcile playback', () => {
    it('switching collections stops playback', () => {
      const s = session(withSlideshow());
      s.run(playback({ type: 'start' }), {
        area: 'slideshow',
        command: { type: 'select', collectionId: RAFFLE },
      });
      expect(s.state.slideshowPlayback).toEqual({ status: 'stopped', mediaId: null });
    });

    it('a new interval gives the slide showing a fresh deadline', () => {
      const s = session(withSlideshow());
      s.run(playback({ type: 'start' }));
      s.wait(4);
      s.run({
        area: 'slideshow',
        command: { type: 'setInterval', collectionId: SPONSORS, secondsPerSlide: 30 },
      });
      expect(s.state.slideshowPlayback).toEqual({ status: 'playing', mediaId: A, advanceAt: START + 34_000 });
    });

    it('adds imported images to the end of the collection and refuses a collection that is gone', () => {
      const s = session(withSlideshow());
      s.run({ area: 'slideshow', command: { type: 'addImages', collectionId: RAFFLE, images: [image(C)] } });
      expect(s.state.slideshow.collections[1]?.slides).toEqual([
        { mediaId: B, fit: null },
        { mediaId: C, fit: null, image: image(C) },
      ]);
      expect(
        s.attempt({
          area: 'slideshow',
          command: { type: 'addImages', collectionId: '99999999-9999-4999-8999-999999999999', images: [] },
        }),
      ).toEqual({ ok: false, error: 'That slideshow collection no longer exists.' });
    });
  });

  describe('playback and the presentation mode', () => {
    it('is refused unless the slideshow is shown', () => {
      const s = session(withSlideshow({ presentationMode: 'gameBoard' }));
      expect(s.attempt(playback({ type: 'start' }))).toEqual({
        ok: false,
        error: 'Open Slideshow to control playback.',
      });
    });

    it('leaving the slideshow stops it on the slide it was showing', () => {
      const s = session(withSlideshow());
      s.run(playback({ type: 'start' }), {
        area: 'presentationMode',
        command: { type: 'setMode', mode: 'gameBoard' },
      });
      expect(s.state.slideshowPlayback).toEqual({ status: 'stopped', mediaId: A });
    });

    it('advances at the deadline it was given, and ignores a stale one', () => {
      const s = session(withSlideshow());
      s.run(playback({ type: 'start' }));
      s.wait(10);
      s.run(playback({ type: 'advance', deadline: START + 5_000 }));
      expect(s.state.slideshowPlayback).toMatchObject({ mediaId: A });
      s.run(playback({ type: 'advance', deadline: START + 10_000 }));
      expect(s.state.slideshowPlayback).toEqual({ status: 'playing', mediaId: B, advanceAt: START + 20_000 });
    });
  });

  it('settings change only themselves', () => {
    const s = session();
    const before = s.state;
    s.run(
      { area: 'settings', command: { type: 'setControllerTheme', theme: 'dark' } },
      { area: 'settings', command: { type: 'setPreferredDisplay', displayId: 2 } },
    );
    expect(s.state).toEqual({ ...before, controllerTheme: 'dark', preferredDisplayId: 2 });
  });
});
