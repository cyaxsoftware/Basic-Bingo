/**
 * Canonical call-sequence rules (product design §5.1).
 *
 * `calledNumbers` is an ordered array of unique balls. The last element is the
 * current call. Order is chronological and must never be lost: do not convert
 * this to a Set or sort it.
 */
import { assertValidBall, isValidBall, type BallNumber } from './balls';

export type CalledNumbers = readonly BallNumber[];

export const PREVIOUS_CALLS_SHOWN = 5;

/**
 * Toggle a ball:
 *  - not called -> appended as the newest call
 *  - called     -> removed; all other calls keep their relative order
 *
 * Returns a new array; never mutates the input. Throws RangeError for anything
 * other than an integer 1..75.
 */
export function toggleBall(calledNumbers: CalledNumbers, ball: BallNumber): BallNumber[] {
  assertValidBall(ball);
  return calledNumbers.includes(ball) ? calledNumbers.filter((n) => n !== ball) : [...calledNumbers, ball];
}

/** The most recent active call, or null when nothing is called. */
export function currentCall(calledNumbers: CalledNumbers): BallNumber | null {
  return calledNumbers.at(-1) ?? null;
}

/**
 * Up to `count` active calls immediately preceding the current call, newest
 * first. The current call is never included.
 */
export function previousCalls(calledNumbers: CalledNumbers, count = PREVIOUS_CALLS_SHOWN): BallNumber[] {
  if (count <= 0) return [];
  return calledNumbers.slice(0, -1).slice(-count).toReversed();
}

/**
 * Make untrusted input (a state file, an IPC payload) safe to use as
 * `calledNumbers`: keeps only valid balls, drops duplicates (first occurrence
 * wins, preserving chronological order). Non-arrays become [].
 */
export function normalizeCalledNumbers(input: unknown): BallNumber[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<BallNumber>();
  const result: BallNumber[] = [];
  for (const value of input) {
    if (isValidBall(value) && !seen.has(value)) {
      seen.add(value);
      result.push(value);
    }
  }
  return result;
}

/** True when `input` is already a valid, duplicate-free call sequence. */
export function isNormalizedCalledNumbers(input: unknown): input is BallNumber[] {
  return Array.isArray(input) && normalizeCalledNumbers(input).length === input.length;
}
