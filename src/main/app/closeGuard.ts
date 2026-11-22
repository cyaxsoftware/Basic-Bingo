/**
 * Decides whether the Controller may close (and the app quit) when its game
 * might not be fully saved. Electron-free so it can be unit-tested; main.ts
 * supplies a native dialog as `ask`.
 *
 * Flow: wait briefly for the latest save. If saved, close. Otherwise ask the
 * operator: retry (save again, then re-check), keep the app open, or quit anyway.
 */
import type { SaveOutcome } from '../state/appStore';

export type CloseChoice = 'retry' | 'keepOpen' | 'quit';

export interface CloseGuardDeps {
  /** Wait for the latest save to finish, up to the deadline. */
  settleSaves(timeoutMs: number): Promise<SaveOutcome>;
  /** Start another save of the current state. */
  retrySave(): void;
  /** Ask the operator what to do about an unsaved game. */
  ask(outcome: Exclude<SaveOutcome, 'saved'>): Promise<CloseChoice>;
  /** How long to wait for a pending save before asking. */
  readonly deadlineMs: number;
}

/** Resolves true if the app may close now. */
export async function confirmClose(deps: CloseGuardDeps): Promise<boolean> {
  for (;;) {
    const outcome = await deps.settleSaves(deps.deadlineMs);
    if (outcome === 'saved') return true;
    const choice = await deps.ask(outcome);
    if (choice === 'quit') return true;
    if (choice === 'keepOpen') return false;
    deps.retrySave();
  }
}

/** Operator-facing wording for the unsaved-game dialog. */
export function describeUnsavedGame(outcome: Exclude<SaveOutcome, 'saved'>): {
  message: string;
  detail: string;
} {
  return outcome === 'failed'
    ? {
        message: 'The latest calls could not be saved.',
        detail:
          'If you quit now, the game will reopen without the calls made since the last successful save. ' +
          'Retry the save, or keep the app open and check the warning on the Controller.',
      }
    : {
        message: 'Saving the latest calls is taking longer than expected.',
        detail:
          'If you quit now, the most recent calls may be missing when the game reopens. ' +
          'Retry to wait for the save again.',
      };
}
