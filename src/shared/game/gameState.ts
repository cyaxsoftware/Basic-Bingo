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
import { assertValidBall, type BallNumber } from './balls';
import { toggleBall } from './calledNumbers';

export interface GameState {
  /** Ordered, unique, chronological. Last element = current call. */
  readonly calledNumbers: readonly BallNumber[];
  /**
   * True while the "BINGO CALLED" verification banner is up. Only an explicit
   * dismiss or a new game clears it; nothing hides it automatically.
   */
  readonly bingoBannerVisible: boolean;
}

export const INITIAL_GAME_STATE: GameState = Object.freeze({
  calledNumbers: Object.freeze([]) as readonly BallNumber[],
  bingoBannerVisible: false,
});

export type GameCommand =
  | { readonly type: 'toggleBall'; readonly ball: BallNumber }
  | { readonly type: 'showBingoBanner' }
  | { readonly type: 'dismissBingoBanner' }
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
      return { ...state, calledNumbers: toggleBall(state.calledNumbers, command.ball) };
    }
    case 'showBingoBanner':
      return state.bingoBannerVisible ? state : { ...state, bingoBannerVisible: true };
    case 'dismissBingoBanner':
      // Deliberately leaves the calls alone: the banner is for verifying a card against them.
      return state.bingoBannerVisible ? { ...state, bingoBannerVisible: false } : state;
    case 'newGame': {
      if (state.calledNumbers.length === 0 && !state.bingoBannerVisible) return state;
      // Spread so any future game field is kept unless it is explicitly reset here.
      return { ...state, calledNumbers: [], bingoBannerVisible: false };
    }
    default: {
      // Compile-time exhaustiveness check; at runtime `command` can still be anything.
      const unknownCommand: never = command;
      throw new Error(`Unhandled game command: ${String((unknownCommand as { type?: unknown }).type)}`);
    }
  }
}
