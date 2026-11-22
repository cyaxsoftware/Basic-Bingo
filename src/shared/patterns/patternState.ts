/**
 * The pattern commands, as one reducer, the same shape as `reduceGame`.
 *
 * The main process runs it; renderers only send commands and read snapshots. It is a thin layer over the
 * operations in patternLibrary.ts: it adds the "set this cell to on/off" form the Controller needs, keeps the
 * working copy in step with the library after every library change, and returns the SAME object when a
 * command changes nothing (so the store can skip saving and publishing).
 *
 * `now` and `newId` are passed in so the rules stay deterministic. Invalid arguments throw RangeError.
 */
import {
  assertCellIndex,
  normalizeTitle,
  type ActivePattern,
  type PatternCells,
  type PatternLibrary,
} from './pattern';
import {
  createActivePattern,
  createPattern,
  deletePattern,
  duplicatePattern,
  reconcileActive,
  renameActive,
  renamePattern,
  saveActiveAsNew,
  selectPattern,
  toggleCell,
  updateSavedPattern,
} from './patternLibrary';

/** The library and the working copy, which always travel together. */
export interface PatternsState {
  readonly library: PatternLibrary;
  readonly active: ActivePattern;
}

export const BLANK_ACTIVE_TITLE = 'Untitled pattern';

/** What the game shows before the operator has chosen a pattern: an empty one-off. */
export function blankActivePattern(): ActivePattern {
  return createActivePattern(BLANK_ACTIVE_TITLE, Array<boolean>(25).fill(false));
}

export type PatternCommand =
  | { readonly type: 'selectPattern'; readonly patternId: string }
  | { readonly type: 'setActivePatternCell'; readonly index: number; readonly on: boolean }
  | { readonly type: 'renameActivePattern'; readonly title: string }
  | { readonly type: 'updateSavedPattern' }
  | { readonly type: 'saveActivePatternAsNew'; readonly title?: string }
  | { readonly type: 'createPattern'; readonly title: string; readonly cells: PatternCells }
  | { readonly type: 'renamePattern'; readonly patternId: string; readonly title: string }
  | { readonly type: 'duplicatePattern'; readonly patternId: string }
  | { readonly type: 'deletePattern'; readonly patternId: string };

export type PatternCommandType = PatternCommand['type'];

export interface PatternContext {
  /** ISO timestamp for anything this command creates or updates. */
  readonly now: string;
  /** A fresh, unused id for a pattern this command creates. */
  readonly newId: () => string;
}

/** Apply a command. Returns the next state, or the same object when nothing changed. Throws RangeError for bad input. */
export function reducePatterns(
  state: PatternsState,
  command: PatternCommand,
  context: PatternContext,
): PatternsState {
  const { library, active } = state;
  switch (command.type) {
    case 'selectPattern': {
      const selected = selectPattern(library, command.patternId);
      return { library, active: selected };
    }
    case 'setActivePatternCell': {
      assertCellIndex(command.index);
      if (typeof command.on !== 'boolean') throw new RangeError('A pattern cell is either on or off.');
      // Idempotent: asking for the state a cell is already in changes nothing.
      if (active.cells[command.index] === command.on) return state;
      return { library, active: toggleCell(active, library, command.index) };
    }
    case 'renameActivePattern': {
      // Validates the title too. Naming it what it already is changes nothing.
      if (normalizeTitle(command.title) === active.title) return state;
      return { library, active: renameActive(active, library, command.title) };
    }
    case 'updateSavedPattern':
      return updateSavedPattern(library, active, context.now);
    case 'saveActivePatternAsNew': {
      const input = { id: context.newId(), now: context.now };
      return saveActiveAsNew(
        library,
        active,
        command.title === undefined ? input : { ...input, title: command.title },
      );
    }
    case 'createPattern': {
      const next = createPattern(library, {
        id: context.newId(),
        title: command.title,
        cells: command.cells,
        now: context.now,
      });
      return { library: next, active: reconcileActive(active, next) };
    }
    case 'renamePattern': {
      const next = renamePattern(library, command.patternId, command.title, context.now);
      return { library: next, active: reconcileActive(active, next) };
    }
    case 'duplicatePattern': {
      const next = duplicatePattern(library, command.patternId, { id: context.newId(), now: context.now });
      return { library: next, active: reconcileActive(active, next) };
    }
    case 'deletePattern': {
      const next = deletePattern(library, command.patternId);
      // If it was the working copy's template, the copy stays on screen as a one-off.
      return { library: next, active: reconcileActive(active, next) };
    }
    default: {
      // Compile-time exhaustiveness check; at runtime `command` can still be anything.
      const unknownCommand: never = command;
      throw new Error(`Unhandled pattern command: ${String((unknownCommand as { type?: unknown }).type)}`);
    }
  }
}
