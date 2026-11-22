/**
 * Winning patterns: the types, and the validation every operation shares.
 *
 * A pattern is a 5x5 grid of 25 explicit booleans in row-major order. There is NO free-space rule: the
 * center square (index 12) is an ordinary cell that is on only when a pattern's definition says so, and
 * the operator can switch it either way. Patterns are visual instructions only; the app never decides
 * whether a card has won (design doc §5.4).
 *
 * Pure module: no Electron, Node, React, clocks or random ids. Anything time- or id-dependent is passed in
 * by the caller, so every function is deterministic.
 */

export const PATTERN_SIZE = 5;
export const PATTERN_CELL_COUNT = PATTERN_SIZE * PATTERN_SIZE;
export const MAX_PATTERN_TITLE_LENGTH = 60;

/** Exactly {@link PATTERN_CELL_COUNT} booleans, row-major: index = row * 5 + column. */
export type PatternCells = readonly boolean[];

/** A saved library template. */
export interface Pattern {
  readonly id: string;
  readonly title: string;
  readonly cells: PatternCells;
  /** ISO timestamps. Informational. */
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * What the game is showing now: a working COPY of a library pattern (or of nothing, for a one-off).
 * Editing it never changes the library; only an explicit update or save does.
 */
export interface ActivePattern {
  /** The library template this was copied from, or null for a one-off that is not in the library. */
  readonly sourcePatternId: string | null;
  readonly title: string;
  readonly cells: PatternCells;
  /** True while the title or cells differ from the source template. Always false when there is no source. */
  readonly editedFromLibrary: boolean;
}

export type PatternLibrary = readonly Pattern[];

export function isPatternCells(value: unknown): value is PatternCells {
  return (
    Array.isArray(value) &&
    value.length === PATTERN_CELL_COUNT &&
    value.every((cell) => typeof cell === 'boolean')
  );
}

/** Throws RangeError unless `value` is exactly 25 booleans. */
export function assertPatternCells(value: unknown): asserts value is PatternCells {
  if (!isPatternCells(value)) {
    throw new RangeError(`A pattern needs exactly ${PATTERN_CELL_COUNT} true/false cells.`);
  }
}

/** Throws RangeError unless `index` is an integer from 0 to 24. */
export function assertCellIndex(index: unknown): asserts index is number {
  if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index >= PATTERN_CELL_COUNT) {
    throw new RangeError(
      `Invalid pattern cell ${String(index)}: expected an integer from 0 to ${PATTERN_CELL_COUNT - 1}.`,
    );
  }
}

/** Trim a title and check it is 1 to {@link MAX_PATTERN_TITLE_LENGTH} characters. Throws RangeError otherwise. */
export function normalizeTitle(title: unknown): string {
  if (typeof title !== 'string') throw new RangeError('A pattern title must be text.');
  const trimmed = title.trim();
  if (trimmed.length === 0) throw new RangeError('A pattern title cannot be empty.');
  if (trimmed.length > MAX_PATTERN_TITLE_LENGTH) {
    throw new RangeError(`A pattern title can be at most ${MAX_PATTERN_TITLE_LENGTH} characters.`);
  }
  return trimmed;
}

/**
 * Build cells from a picture, which makes definitions readable: five strings of five characters,
 * where `X` is on and `.` is off.
 *
 *   cellsFromPicture(['X...X', '.....', '.....', '.....', 'X...X'])   // Four Corners
 */
export function cellsFromPicture(rows: readonly string[]): PatternCells {
  if (rows.length !== PATTERN_SIZE || rows.some((row) => row.length !== PATTERN_SIZE)) {
    throw new RangeError(`A pattern picture is ${PATTERN_SIZE} rows of ${PATTERN_SIZE} characters.`);
  }
  const cells = rows.flatMap((row) =>
    [...row].map((character) => {
      if (character !== 'X' && character !== '.') {
        throw new RangeError(`A pattern picture uses only "X" (on) and "." (off), not "${character}".`);
      }
      return character === 'X';
    }),
  );
  assertPatternCells(cells);
  return cells;
}

export function sameCells(a: PatternCells, b: PatternCells): boolean {
  return a.length === b.length && a.every((cell, index) => cell === b[index]);
}
