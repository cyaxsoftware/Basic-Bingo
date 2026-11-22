import { describe, expect, it } from 'vitest';
import { buildBoardRows, summarizeCalls } from './boardModel';
import { INITIAL_GAME_STATE, reduceGame, type GameCommand } from './gameState';

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
  const played = { calledNumbers: [3, 17, 9], bingoBannerVisible: false } as const;

  it('starts with the banner hidden', () => {
    expect(INITIAL_GAME_STATE.bingoBannerVisible).toBe(false);
  });

  it('showBingoBanner raises the banner and keeps the calls', () => {
    const next = reduceGame(played, { type: 'showBingoBanner' });
    expect(next).toEqual({ calledNumbers: [3, 17, 9], bingoBannerVisible: true });
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
    expect(reduceGame(shown, { type: 'newGame' })).toEqual({ calledNumbers: [], bingoBannerVisible: false });
  });

  it('newGame resets nothing but the game: any other field is carried over', () => {
    const withExtra = { ...played, bingoBannerVisible: true, futureField: 'kept' };
    expect(reduceGame(withExtra, { type: 'newGame' })).toEqual({
      calledNumbers: [],
      bingoBannerVisible: false,
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
