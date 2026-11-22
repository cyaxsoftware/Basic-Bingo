import { describe, expect, it } from 'vitest';
import { ballsForLetter, formatBall, isValidBall, letterForBall } from './balls';

describe('letterForBall', () => {
  it.each([
    [1, 'B'],
    [15, 'B'],
    [16, 'I'],
    [30, 'I'],
    [31, 'N'],
    [45, 'N'],
    [46, 'G'],
    [60, 'G'],
    [61, 'O'],
    [75, 'O'],
  ])('ball %i is %s', (ball, letter) => {
    expect(letterForBall(ball)).toBe(letter);
  });

  it('throws for out-of-range balls', () => {
    expect(() => letterForBall(0)).toThrow(RangeError);
    expect(() => letterForBall(76)).toThrow(RangeError);
  });
});

describe('ball helpers', () => {
  it('formats a ball label', () => {
    expect(formatBall(3)).toBe('B-3');
    expect(formatBall(75)).toBe('O-75');
  });

  it('lists 15 balls per letter', () => {
    expect(ballsForLetter('B')).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
    expect(ballsForLetter('O')[0]).toBe(61);
    expect(ballsForLetter('O').at(-1)).toBe(75);
  });

  it('validates ball numbers', () => {
    expect(isValidBall(1)).toBe(true);
    expect(isValidBall(75)).toBe(true);
    expect(isValidBall(0)).toBe(false);
    expect(isValidBall(2.5)).toBe(false);
    expect(isValidBall('5')).toBe(false);
  });
});
