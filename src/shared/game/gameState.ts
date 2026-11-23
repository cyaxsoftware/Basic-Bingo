/**
 * Game state and the commands that change it.
 *
 * The reducer is the single place where game rules are applied. The main
 * process runs it; renderers only send commands and read snapshots.
 *
 * To add a command:
 *   1. Add a variant to `GameCommand`.
 *   2. Handle it in `reduceGame` and add tests in gameState.test.ts.
 *   3. Expose it through the IPC contract (see docs/architecture.md).
 */
import {
  assertValidBall,
  BINGO_LETTERS,
  isBingoLetter,
  letterForBall,
  type BallNumber,
  type BingoLetter,
} from './balls';
import { toggleBall } from './calledNumbers';

export interface GameState {
  /** Ordered, unique, chronological. Last element = current call. */
  readonly calledNumbers: readonly BallNumber[];
  /**
   * True while the "BINGO CALLED" verification banner is up. Only an explicit
   * dismiss or a new game clears it; nothing hides it automatically. While it is up the balls cannot be
   * tapped (a call or a correction), so the calls cannot change under the card that is being checked.
   */
  readonly bingoBannerVisible: boolean;
  /**
   * Rows (letters) the operator has blacked out because this game does not use them. The balls in a blacked-out
   * row cannot be called or un-called until the row is brought back (calls already made stay as they are). In
   * B, I, N, G, O order. Kept by New Game, like the pattern.
   */
  readonly disabledRows: readonly BingoLetter[];
}

export const INITIAL_GAME_STATE: GameState = Object.freeze({
  calledNumbers: Object.freeze([]) as readonly BallNumber[],
  bingoBannerVisible: false,
  disabledRows: Object.freeze([]) as readonly BingoLetter[],
});

export type GameCommand =
  | { readonly type: 'toggleBall'; readonly ball: BallNumber }
  | { readonly type: 'showBingoBanner' }
  | { readonly type: 'dismissBingoBanner' }
  | { readonly type: 'toggleRowDisabled'; readonly letter: BingoLetter }
  | { readonly type: 'newGame' };

export type GameCommandType = GameCommand['type'];

/**
 * Apply a command. Returns the next state, or the same object when nothing
 * changed. Throws RangeError for invalid command arguments.
 */
export function reduceGame(state: GameState, command: GameCommand): GameState {
  switch (command.type) {
    case 'toggleBall': {
      assertValidBall(command.ball);
      if (state.bingoBannerVisible) {
        throw new RangeError('BINGO CALLED is up. Dismiss it before calling or removing numbers.');
      }
      const letter = letterForBall(command.ball);
      if (state.disabledRows.includes(letter)) {
        throw new RangeError(`The ${letter} row is blacked out. Tap its letter to bring it back first.`);
      }
      return { ...state, calledNumbers: toggleBall(state.calledNumbers, command.ball) };
    }
    case 'showBingoBanner':
      return state.bingoBannerVisible ? state : { ...state, bingoBannerVisible: true };
    case 'dismissBingoBanner':
      // Deliberately leaves the calls alone: the banner is for verifying a card against them.
      return state.bingoBannerVisible ? { ...state, bingoBannerVisible: false } : state;
    case 'toggleRowDisabled': {
      if (!isBingoLetter(command.letter)) {
        throw new RangeError(
          `Invalid row ${String(command.letter)}: expected one of ${BINGO_LETTERS.join(', ')}.`,
        );
      }
      const rows = new Set(state.disabledRows);
      if (!rows.delete(command.letter)) rows.add(command.letter);
      return { ...state, disabledRows: BINGO_LETTERS.filter((letter) => rows.has(letter)) };
    }
    case 'newGame': {
      if (state.calledNumbers.length === 0 && !state.bingoBannerVisible) return state;
      // Spread so any other game field is kept unless it is explicitly reset here: the blacked-out rows
      // are set-up for the next game, like the pattern, so they stay.
      return { ...state, calledNumbers: [], bingoBannerVisible: false };
    }
    default: {
      // Compile-time exhaustiveness check; at runtime `command` can still be anything.
      const unknownCommand: never = command;
      throw new Error(`Unhandled game command: ${String((unknownCommand as { type?: unknown }).type)}`);
    }
  }
}

/** Rows read back from a saved file: only real letters, once each, in B, I, N, G, O order. */
export function normalizeDisabledRows(raw: unknown): BingoLetter[] {
  const rows = new Set(Array.isArray(raw) ? raw.filter(isBingoLetter) : []);
  return BINGO_LETTERS.filter((letter) => rows.has(letter));
}
