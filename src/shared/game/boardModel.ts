/**
 * View-model helpers shared by the Controller and Presentation boards.
 * Both views render the same data; each styles it independently.
 */
import { BINGO_LETTERS, ballsForLetter, type BallNumber, type BingoLetter } from './balls';
import { currentCall, previousCalls, type CalledNumbers } from './calledNumbers';

export type BallStatus = 'uncalled' | 'called' | 'current';

export interface BoardCell {
  readonly ball: BallNumber;
  readonly letter: BingoLetter;
  readonly status: BallStatus;
}

export interface BoardRow {
  readonly letter: BingoLetter;
  readonly cells: readonly BoardCell[];
}

/** Five rows (B, I, N, G, O) of 15 cells each, with per-ball status. */
export function buildBoardRows(calledNumbers: CalledNumbers): BoardRow[] {
  const called = new Set(calledNumbers);
  const current = currentCall(calledNumbers);
  return BINGO_LETTERS.map((letter) => ({
    letter,
    cells: ballsForLetter(letter).map((ball) => ({
      ball,
      letter,
      status: ball === current ? 'current' : called.has(ball) ? 'called' : 'uncalled',
    })),
  }));
}

export interface CallSummary {
  readonly current: BallNumber | null;
  /** Newest first, excludes current, at most 5. */
  readonly previous: readonly BallNumber[];
  readonly calledCount: number;
}

export function summarizeCalls(calledNumbers: CalledNumbers): CallSummary {
  return {
    current: currentCall(calledNumbers),
    previous: previousCalls(calledNumbers),
    calledCount: calledNumbers.length,
  };
}
