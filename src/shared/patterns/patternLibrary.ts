/**
 * Pattern operations: the saved library, and the working copy the game is showing.
 *
 * The rule that shapes everything here (design doc §4.1 and §5.4): the active pattern is a COPY. Selecting,
 * toggling and renaming change only that copy and leave the library template alone. The template changes
 * only when the operator explicitly updates it ({@link updateSavedPattern}) or saves the copy as a new
 * pattern ({@link saveActiveAsNew}). "Edited" means the copy differs from its template.
 *
 * Everything is immutable (inputs are never changed; new objects come back) and deterministic: `now` and
 * new ids are passed in. Invalid arguments throw RangeError, like the game reducer.
 *
 * The active pattern lives outside GameState, like the presentation mode, so New Game (which only clears
 * calls and the banner) cannot touch it. Persisting and exposing it is the next card.
 */
import {
  assertCellIndex,
  assertPatternCells,
  MAX_PATTERN_TITLE_LENGTH,
  normalizeTitle,
  sameCells,
  type ActivePattern,
  type Pattern,
  type PatternCells,
  type PatternLibrary,
} from './pattern';

export interface LibraryAndActive {
  readonly library: PatternLibrary;
  readonly active: ActivePattern;
}

export function findPattern(library: PatternLibrary, id: string): Pattern | undefined {
  return library.find((pattern) => pattern.id === id);
}

function requirePattern(library: PatternLibrary, id: string): Pattern {
  const pattern = findPattern(library, id);
  if (!pattern) throw new RangeError(`There is no saved pattern with id "${id}".`);
  return pattern;
}

function requireNewId(library: PatternLibrary, id: unknown): string {
  if (typeof id !== 'string' || id.length === 0) throw new RangeError('A new pattern needs an id.');
  if (findPattern(library, id)) throw new RangeError(`A saved pattern with id "${id}" already exists.`);
  return id;
}

// ---------------------------------------------------------------------------
// The active (working) copy
// ---------------------------------------------------------------------------

/** True when the copy's title or cells differ from its template. A one-off with no template is never "edited". */
export function isEdited(active: ActivePattern, library: PatternLibrary): boolean {
  if (active.sourcePatternId === null) return false;
  const source = findPattern(library, active.sourcePatternId);
  if (!source) return false;
  return active.title !== source.title || !sameCells(active.cells, source.cells);
}

/**
 * Bring a copy back in step with the library after the library changed: recompute "Edited", and if its
 * template was deleted, keep the copy (the game still shows it) but detach it, so it is a one-off.
 */
export function reconcileActive(active: ActivePattern, library: PatternLibrary): ActivePattern {
  const source = active.sourcePatternId === null ? undefined : findPattern(library, active.sourcePatternId);
  if (active.sourcePatternId !== null && !source) {
    return { ...active, sourcePatternId: null, editedFromLibrary: false };
  }
  const editedFromLibrary = isEdited(active, library);
  return editedFromLibrary === active.editedFromLibrary ? active : { ...active, editedFromLibrary };
}

/** A pattern that is not in the library ("a generic selected pattern can also be used without saving"). */
export function createActivePattern(title: string, cells: PatternCells): ActivePattern {
  assertPatternCells(cells);
  return { sourcePatternId: null, title: normalizeTitle(title), cells: [...cells], editedFromLibrary: false };
}

/** Start showing a library pattern: an unedited copy of it. */
export function selectPattern(library: PatternLibrary, patternId: string): ActivePattern {
  const pattern = requirePattern(library, patternId);
  return {
    sourcePatternId: pattern.id,
    title: pattern.title,
    cells: [...pattern.cells],
    editedFromLibrary: false,
  };
}

/** Flip one cell of the copy. Every cell is editable, the center included. */
export function toggleCell(active: ActivePattern, library: PatternLibrary, index: number): ActivePattern {
  assertCellIndex(index);
  const cells = active.cells.map((cell, position) => (position === index ? !cell : cell));
  return reconcileActive({ ...active, cells }, library);
}

/** Rename the copy (not the template). */
export function renameActive(active: ActivePattern, library: PatternLibrary, title: string): ActivePattern {
  return reconcileActive({ ...active, title: normalizeTitle(title) }, library);
}

/** Write the copy's title and cells back to its template, which is the only way a copy changes the library. */
export function updateSavedPattern(
  library: PatternLibrary,
  active: ActivePattern,
  now: string,
): LibraryAndActive {
  if (active.sourcePatternId === null) {
    throw new RangeError(
      'This pattern is not in the library, so there is nothing to update. Save it as a new pattern.',
    );
  }
  const source = requirePattern(library, active.sourcePatternId);
  const updated: Pattern = { ...source, title: active.title, cells: [...active.cells], updatedAt: now };
  const next = library.map((pattern) => (pattern.id === source.id ? updated : pattern));
  return { library: next, active: reconcileActive(active, next) };
}

export interface NewPatternInput {
  readonly id: string;
  readonly now: string;
}

/** Add the copy to the library as a new pattern and make it that pattern's copy. The old template is untouched. */
export function saveActiveAsNew(
  library: PatternLibrary,
  active: ActivePattern,
  input: NewPatternInput & { readonly title?: string },
): LibraryAndActive {
  const id = requireNewId(library, input.id);
  const title = normalizeTitle(input.title ?? active.title);
  const saved: Pattern = { id, title, cells: [...active.cells], createdAt: input.now, updatedAt: input.now };
  const next = [...library, saved];
  return {
    library: next,
    active: { sourcePatternId: id, title, cells: [...active.cells], editedFromLibrary: false },
  };
}

// ---------------------------------------------------------------------------
// The library
// ---------------------------------------------------------------------------

export function createPattern(
  library: PatternLibrary,
  input: NewPatternInput & { readonly title: string; readonly cells: PatternCells },
): PatternLibrary {
  const id = requireNewId(library, input.id);
  assertPatternCells(input.cells);
  const pattern: Pattern = {
    id,
    title: normalizeTitle(input.title),
    cells: [...input.cells],
    createdAt: input.now,
    updatedAt: input.now,
  };
  return [...library, pattern];
}

export function renamePattern(
  library: PatternLibrary,
  id: string,
  title: string,
  now: string,
): PatternLibrary {
  requirePattern(library, id);
  const normalized = normalizeTitle(title);
  return library.map((pattern) =>
    pattern.id === id ? { ...pattern, title: normalized, updatedAt: now } : pattern,
  );
}

/** Add a copy of a pattern right after it, titled "<title> (copy)". */
export function duplicatePattern(
  library: PatternLibrary,
  id: string,
  input: NewPatternInput,
): PatternLibrary {
  const source = requirePattern(library, id);
  const newId = requireNewId(library, input.id);
  const suffix = ' (copy)';
  const title = `${source.title.slice(0, MAX_PATTERN_TITLE_LENGTH - suffix.length).trimEnd()}${suffix}`;
  const copy: Pattern = {
    id: newId,
    title,
    cells: [...source.cells],
    createdAt: input.now,
    updatedAt: input.now,
  };
  const at = library.findIndex((pattern) => pattern.id === id) + 1;
  return [...library.slice(0, at), copy, ...library.slice(at)];
}

/** Remove a pattern. Callers should {@link reconcileActive} afterwards, in case it was the active copy's template. */
export function deletePattern(library: PatternLibrary, id: string): PatternLibrary {
  requirePattern(library, id);
  return library.filter((pattern) => pattern.id !== id);
}
