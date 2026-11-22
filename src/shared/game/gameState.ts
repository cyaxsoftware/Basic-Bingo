/**
 * Game state and the commands that change it.
 *
 * The reducer is the single place where game rules are applied. The main
 * process runs it; renderers only send commands and read snapshots.
 *
 * To add a command (e.g. NEW_GAME in milestone 2):
 *   1. Add a variant to `GameCommand`.
 *   2. Handle it in `reduceGame` and add tests in gameState.test.ts.
 *   3. Expose it through the IPC contract (see docs/architecture.md).
 */
import { assertValidBall, type BallNumber } from './balls';
import { toggleBall } from './calledNumbers';

export interface GameState {
  /** Ordered, unique, chronological. Last element = current call. */
  readonly calledNumbers: readonly BallNumber[];
}

export const INITIAL_GAME_STATE: GameState = Object.freeze({
  calledNumbers: Object.freeze([]) as readonly BallNumber[],
});

export type GameCommand = { readonly type: 'toggleBall'; readonly ball: BallNumber };

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
    default: {
      const unknownCommand: never = command.type;
      throw new Error(`Unhandled game command: ${String(unknownCommand)}`);
    }
  }
}
