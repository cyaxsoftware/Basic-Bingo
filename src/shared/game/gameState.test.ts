import { describe, expect, it } from 'vitest';
import { buildBoardRows, summarizeCalls } from './boardModel';
import { INITIAL_GAME_STATE, normalizeDisabledRows, reduceGame, type GameCommand } from './gameState';

describe('reduceGame', () => {
  it('applies toggleBall', () => {
    const next = reduceGame(INITIAL_GAME_STATE, { type: 'toggleBall', ball: 3 });
    expect(next.calledNumbers).toEqual([3]);
    expect(INITIAL_GAME_STATE.calledNumbers).toEqual([]);
  });

  it('throws on invalid toggle arguments', () => {
    expect(() => reduceGame(INITIAL_GAME_STATE, { type: 'toggleBall', ball: 99 })).toThrow(RangeError);
  });

  it('throws on unknown command types', () => {
    const bogus = { type: 'explode' } as unknown as GameCommand;
    expect(() => reduceGame(INITIAL_GAME_STATE, bogus)).toThrow(/Unhandled game command/);
  });
});

describe('BINGO banner and new game', () => {
  const played = { calledNumbers: [3, 17, 9], bingoBannerVisible: false, disabledRows: [] } as const;

  it('starts with the banner hidden', () => {
    expect(INITIAL_GAME_STATE.bingoBannerVisible).toBe(false);
  });

  it('showBingoBanner raises the banner and keeps the calls', () => {
    const next = reduceGame(played, { type: 'showBingoBanner' });
    expect(next).toEqual({ calledNumbers: [3, 17, 9], bingoBannerVisible: true, disabledRows: [] });
  });

  it('showBingoBanner is idempotent (same object when already visible)', () => {
    const shown = reduceGame(played, { type: 'showBingoBanner' });
    expect(reduceGame(shown, { type: 'showBingoBanner' })).toBe(shown);
  });

  it('dismissBingoBanner hides only the banner: calls, current and previous are unchanged', () => {
    const shown = reduceGame(played, { type: 'showBingoBanner' });
    const next = reduceGame(shown, { type: 'dismissBingoBanner' });
    expect(next.bingoBannerVisible).toBe(false);
    expect(next.calledNumbers).toEqual([3, 17, 9]);
    expect(summarizeCalls(next.calledNumbers)).toEqual(summarizeCalls(shown.calledNumbers));
  });

  it('dismissBingoBanner with no banner changes nothing', () => {
    expect(reduceGame(played, { type: 'dismissBingoBanner' })).toBe(played);
  });

  it('the banner stays up through further calls until it is dismissed', () => {
    let state = reduceGame(played, { type: 'showBingoBanner' });
    state = reduceGame(state, { type: 'toggleBall', ball: 40 });
    state = reduceGame(state, { type: 'toggleBall', ball: 3 });
    expect(state.bingoBannerVisible).toBe(true);
    expect(state.calledNumbers).toEqual([17, 9, 40]);
  });

  it('newGame clears the calls and the banner', () => {
    const shown = reduceGame(played, { type: 'showBingoBanner' });
    expect(reduceGame(shown, { type: 'newGame' })).toEqual({
      calledNumbers: [],
      bingoBannerVisible: false,
      disabledRows: [],
    });
  });

  it('newGame resets nothing but the game: any other field is carried over', () => {
    const withExtra = { ...played, bingoBannerVisible: true, futureField: 'kept' };
    expect(reduceGame(withExtra, { type: 'newGame' })).toEqual({
      calledNumbers: [],
      bingoBannerVisible: false,
      disabledRows: [],
      futureField: 'kept',
    });
  });

  it('newGame on a fresh game changes nothing', () => {
    expect(reduceGame(INITIAL_GAME_STATE, { type: 'newGame' })).toBe(INITIAL_GAME_STATE);
  });

  it('does not mutate the previous state', () => {
    const before = structuredClone(played);
    reduceGame(played, { type: 'showBingoBanner' });
    reduceGame(played, { type: 'newGame' });
    expect(played).toEqual(before);
  });
});

describe('board model', () => {
  it('builds 5 rows of 15 with statuses', () => {
    const rows = buildBoardRows([3, 20, 75]);
    expect(rows.map((r) => r.letter)).toEqual(['B', 'I', 'N', 'G', 'O']);
    expect(rows.every((r) => r.cells.length === 15)).toBe(true);
    const status = (ball: number) => rows.flatMap((r) => r.cells).find((c) => c.ball === ball)?.status;
    expect(status(3)).toBe('called');
    expect(status(20)).toBe('called');
    expect(status(75)).toBe('current');
    expect(status(4)).toBe('uncalled');
  });

  it('summarizes calls', () => {
    expect(summarizeCalls([])).toEqual({ current: null, previous: [], calledCount: 0 });
    expect(summarizeCalls([3, 17, 9])).toEqual({ current: 9, previous: [17, 3], calledCount: 3 });
  });
});

describe('blacked-out rows', () => {
  const toggle = (state: typeof INITIAL_GAME_STATE, letter: 'B' | 'I' | 'N' | 'G' | 'O') =>
    reduceGame(state, { type: 'toggleRowDisabled', letter });

  it('starts with every row in play', () => {
    expect(INITIAL_GAME_STATE.disabledRows).toEqual([]);
  });

  it('toggles a row out and back in', () => {
    const out = toggle(INITIAL_GAME_STATE, 'N');
    expect(out.disabledRows).toEqual(['N']);
    expect(toggle(out, 'N').disabledRows).toEqual([]);
    expect(INITIAL_GAME_STATE.disabledRows).toEqual([]);
  });

  it('keeps the rows in B, I, N, G, O order however they were chosen', () => {
    let state = toggle(INITIAL_GAME_STATE, 'O');
    state = toggle(state, 'B');
    state = toggle(state, 'G');
    expect(state.disabledRows).toEqual(['B', 'G', 'O']);
  });

  it('is only a reminder: it never changes the calls or the banner', () => {
    const played = reduceGame(reduceGame(INITIAL_GAME_STATE, { type: 'toggleBall', ball: 3 }), {
      type: 'showBingoBanner',
    });
    const next = toggle(played, 'B');
    expect(next.calledNumbers).toBe(played.calledNumbers);
    expect(next.bingoBannerVisible).toBe(true);
    // A ball in a blacked-out row can still be called (and corrected).
    expect(reduceGame(next, { type: 'toggleBall', ball: 4 }).calledNumbers).toEqual([3, 4]);
  });

  it('survives New Game, which clears only the calls and the banner', () => {
    let state = toggle(toggle(INITIAL_GAME_STATE, 'I'), 'O');
    state = reduceGame(state, { type: 'toggleBall', ball: 20 });
    const fresh = reduceGame(state, { type: 'newGame' });
    expect(fresh.calledNumbers).toEqual([]);
    expect(fresh.disabledRows).toEqual(['I', 'O']);
  });

  it.each(['X', 'b', '', 7, null, undefined])('rejects %j as a row', (letter) => {
    expect(() =>
      reduceGame(INITIAL_GAME_STATE, { type: 'toggleRowDisabled', letter } as unknown as GameCommand),
    ).toThrow(RangeError);
  });

  it('reads rows back from a file: only real letters, once each, in order', () => {
    expect(normalizeDisabledRows(['O', 'B', 'B', 'X', 3, null, 'n'])).toEqual(['B', 'O']);
    expect(normalizeDisabledRows('B')).toEqual([]);
    expect(normalizeDisabledRows(undefined)).toEqual([]);
  });
});

describe('the board model with blacked-out rows', () => {
  it('marks only the chosen rows', () => {
    const rows = buildBoardRows([3], ['I', 'G']);
    expect(rows.map((row) => [row.letter, row.disabled])).toEqual([
      ['B', false],
      ['I', true],
      ['N', false],
      ['G', true],
      ['O', false],
    ]);
  });

  it('leaves every row in play by default', () => {
    expect(buildBoardRows([]).every((row) => !row.disabled)).toBe(true);
  });
});
