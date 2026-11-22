import { describe, expect, it } from 'vitest';
import {
  currentCall,
  isNormalizedCalledNumbers,
  normalizeCalledNumbers,
  previousCalls,
  toggleBall,
} from './calledNumbers';

/** Apply taps in order and return every intermediate sequence. */
function tapAll(start: number[], taps: number[]): number[][] {
  const history: number[][] = [];
  let state = start;
  for (const tap of taps) {
    state = toggleBall(state, tap);
    history.push(state);
  }
  return history;
}

describe('toggleBall', () => {
  it('follows the milestone 1 brief sample sequence', () => {
    const steps = tapAll([], [3, 9, 17, 9, 9, 9]);
    expect(steps).toEqual([[3], [3, 9], [3, 9, 17], [3, 17], [3, 17, 9], [3, 17]]);

    expect(currentCall([3, 17])).toBe(17);
    expect(previousCalls([3, 17])).toEqual([3]);
    expect(currentCall([3, 17, 9])).toBe(9);
    expect(previousCalls([3, 17, 9])).toEqual([17, 3]);
  });

  it('follows the product design §5.1 examples', () => {
    let calls = [9, 24, 47, 3];
    calls = toggleBall(calls, 24);
    expect(calls).toEqual([9, 47, 3]);
    expect(currentCall(calls)).toBe(3);

    calls = toggleBall(calls, 3);
    expect(calls).toEqual([9, 47]);
    expect(currentCall(calls)).toBe(47);

    calls = toggleBall(calls, 24);
    expect(calls).toEqual([9, 47, 24]);
    expect(currentCall(calls)).toBe(24);
  });

  it('does not mutate the input array', () => {
    const input = Object.freeze([1, 2, 3]);
    toggleBall(input, 2);
    toggleBall(input, 4);
    expect(input).toEqual([1, 2, 3]);
  });

  it('can call all 75 balls without duplicates', () => {
    let calls: number[] = [];
    for (let ball = 75; ball >= 1; ball--) calls = toggleBall(calls, ball);
    expect(calls).toHaveLength(75);
    expect(new Set(calls).size).toBe(75);
    expect(currentCall(calls)).toBe(1);
  });

  it.each([0, 76, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('rejects invalid ball %s', (ball) => {
    expect(() => toggleBall([], ball)).toThrow(RangeError);
  });

  it.each(['3', null, undefined, {}])('rejects non-number ball %s', (ball) => {
    expect(() => toggleBall([], ball as unknown as number)).toThrow(RangeError);
  });
});

describe('currentCall / previousCalls', () => {
  it('returns null and [] for an empty game', () => {
    expect(currentCall([])).toBeNull();
    expect(previousCalls([])).toEqual([]);
  });

  it('returns no previous calls when only one ball is called', () => {
    expect(currentCall([42])).toBe(42);
    expect(previousCalls([42])).toEqual([]);
  });

  it('returns at most five previous calls, newest first, excluding current', () => {
    const calls = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(currentCall(calls)).toBe(8);
    expect(previousCalls(calls)).toEqual([7, 6, 5, 4, 3]);
  });

  it('supports a custom count', () => {
    expect(previousCalls([1, 2, 3, 4], 2)).toEqual([3, 2]);
    expect(previousCalls([1, 2, 3, 4], 0)).toEqual([]);
  });

  it('updates when the current call is toggled off', () => {
    const calls = toggleBall([3, 9], 9);
    expect(currentCall(calls)).toBe(3);
    expect(previousCalls(calls)).toEqual([]);
  });
});

describe('normalizeCalledNumbers', () => {
  it('keeps valid, unique balls in original order', () => {
    expect(normalizeCalledNumbers([5, 70, 12])).toEqual([5, 70, 12]);
  });

  it('drops invalid values and later duplicates', () => {
    expect(normalizeCalledNumbers([5, '6', 0, 76, 1.5, null, 5, 7, Number.NaN, 7])).toEqual([5, 7]);
  });

  it('returns [] for non-arrays', () => {
    expect(normalizeCalledNumbers(undefined)).toEqual([]);
    expect(normalizeCalledNumbers({ 0: 1 })).toEqual([]);
    expect(normalizeCalledNumbers('1,2,3')).toEqual([]);
  });

  it('isNormalizedCalledNumbers detects already-clean input', () => {
    expect(isNormalizedCalledNumbers([1, 2, 3])).toBe(true);
    expect(isNormalizedCalledNumbers([1, 1])).toBe(false);
    expect(isNormalizedCalledNumbers([0])).toBe(false);
    expect(isNormalizedCalledNumbers('x')).toBe(false);
  });
});
