/**
 * 75-ball bingo constants and ball metadata.
 *
 * Pure module: safe to import from main, preload and renderer code.
 */

export const MIN_BALL = 1;
export const MAX_BALL = 75;
export const BALLS_PER_LETTER = 15;

export const BINGO_LETTERS = ['B', 'I', 'N', 'G', 'O'] as const;
export type BingoLetter = (typeof BINGO_LETTERS)[number];

/** A validated ball number in 1..75. Use {@link isValidBall} to narrow. */
export type BallNumber = number;

export function isValidBall(value: unknown): value is BallNumber {
  return typeof value === 'number' && Number.isInteger(value) && value >= MIN_BALL && value <= MAX_BALL;
}

/** Throws a descriptive error unless `value` is an integer in 1..75. */
export function assertValidBall(value: unknown): asserts value is BallNumber {
  if (!isValidBall(value)) {
    throw new RangeError(
      `Invalid ball ${String(value)}: expected an integer from ${MIN_BALL} to ${MAX_BALL}.`,
    );
  }
}

/** 1..15=B, 16..30=I, 31..45=N, 46..60=G, 61..75=O. */
export function letterForBall(ball: BallNumber): BingoLetter {
  assertValidBall(ball);
  return BINGO_LETTERS[Math.floor((ball - MIN_BALL) / BALLS_PER_LETTER)] as BingoLetter;
}

/** Human label used in UI and accessibility text, e.g. "B-3". */
export function formatBall(ball: BallNumber): string {
  return `${letterForBall(ball)}-${ball}`;
}

/** The 15 ball numbers belonging to a letter, ascending. */
export function ballsForLetter(letter: BingoLetter): BallNumber[] {
  const start = BINGO_LETTERS.indexOf(letter) * BALLS_PER_LETTER + MIN_BALL;
  return Array.from({ length: BALLS_PER_LETTER }, (_, i) => start + i);
}
