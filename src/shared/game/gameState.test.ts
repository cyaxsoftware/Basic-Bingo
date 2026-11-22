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
