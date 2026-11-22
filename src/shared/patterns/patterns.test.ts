import { describe, expect, it } from 'vitest';
import {
  cellsFromPicture,
  createActivePattern,
  createDefaultLibrary,
  createPattern,
  deletePattern,
  duplicatePattern,
  findPattern,
  isEdited,
  assertPatternCells,
  isPatternCells,
  MAX_PATTERN_TITLE_LENGTH,
  PATTERN_CELL_COUNT,
  reconcileActive,
  renameActive,
  renamePattern,
  saveActiveAsNew,
  SEED_TIMESTAMP,
  selectPattern,
  toggleCell,
  updateSavedPattern,
  type ActivePattern,
  type PatternLibrary,
} from './index';

const CENTER = 12;
const NOW = '2026-11-22T12:00:00.000Z';
const LATER = '2026-11-22T13:00:00.000Z';

/** Freezes everything it is given, so a function that mutates its input throws instead of passing quietly. */
function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const inner of Object.values(value)) deepFreeze(inner);
  }
  return value;
}

const library = (): PatternLibrary => deepFreeze(createDefaultLibrary());
const centerOf = (cells: readonly boolean[]) => cells[CENTER];

describe('pattern cells', () => {
  it('are exactly 25 booleans', () => {
    expect(isPatternCells(Array(25).fill(false))).toBe(true);
    expect(isPatternCells(Array(24).fill(false))).toBe(false);
    expect(isPatternCells(Array(26).fill(false))).toBe(false);
    expect(isPatternCells([...Array(24).fill(false), 'x'])).toBe(false);
    expect(isPatternCells('X'.repeat(25))).toBe(false);
  });

  it('reject a sparse array: every one of the 25 cells must be an explicit boolean', () => {
    const sparse: boolean[] = [];
    sparse.length = PATTERN_CELL_COUNT; // 25 slots, all holes
    sparse[0] = true;
    expect(isPatternCells(sparse)).toBe(false);
    expect(() => assertPatternCells(sparse)).toThrow(RangeError);

    // A single hole is enough, wherever it is (including the center).
    const mostlyFilled: boolean[] = Array(PATTERN_CELL_COUNT).fill(false);
    delete mostlyFilled[CENTER];
    expect(mostlyFilled).toHaveLength(PATTERN_CELL_COUNT);
    expect(isPatternCells(mostlyFilled)).toBe(false);
    expect(isPatternCells(Array.from({ length: PATTERN_CELL_COUNT }, () => undefined))).toBe(false);
  });

  it('never let a sparse array into a pattern, whichever constructor it goes through', () => {
    const sparse: boolean[] = [];
    sparse.length = PATTERN_CELL_COUNT; // 25 slots, all holes
    sparse[0] = true;
    expect(() => createActivePattern('Sparse', sparse)).toThrow(RangeError);
    expect(() =>
      createPattern(library(), { id: 'sparse-1', title: 'Sparse', cells: sparse, now: NOW }),
    ).toThrow(RangeError);
  });

  it('are built from a readable picture, row by row', () => {
    const cells = cellsFromPicture(['X...X', '.....', '..X..', '.....', 'X...X']);
    expect(cells).toHaveLength(PATTERN_CELL_COUNT);
    expect(cells[0]).toBe(true);
    expect(cells[4]).toBe(true);
    expect(cells[CENTER]).toBe(true);
    expect(cells[20]).toBe(true);
    expect(cells[24]).toBe(true);
    expect(cells.filter(Boolean)).toHaveLength(5);
  });

  it.each([
    [['X...X', '.....', '.....', '.....']],
    [['X...X', '.....', '.....', '.....', 'X...']],
    [['X...X', '.....', '..?..', '.....', 'X...X']],
  ])('reject a malformed picture %j', (picture) => {
    expect(() => cellsFromPicture(picture)).toThrow(RangeError);
  });
});

describe('the seeded library has no free space', () => {
  const seeds = createDefaultLibrary();
  const centerByTitle = Object.fromEntries(seeds.map((p) => [p.title, centerOf(p.cells)]));

  it('keeps the center OFF for patterns whose shape does not include it', () => {
    expect(centerByTitle['Four Corners']).toBe(false);
    expect(centerByTitle['Big L']).toBe(false);
    expect(centerByTitle['Small Diamond']).toBe(false);
  });

  it('turns the center on only where the shape includes it', () => {
    expect(centerByTitle['Letter X']).toBe(true);
    expect(centerByTitle['Blackout']).toBe(true);
  });

  it('has the expected shapes', () => {
    const cells = (title: string) => seeds.find((p) => p.title === title)?.cells ?? [];
    expect(cells('Four Corners').flatMap((on, i) => (on ? [i] : []))).toEqual([0, 4, 20, 24]);
    expect(cells('Big L').flatMap((on, i) => (on ? [i] : []))).toEqual([0, 5, 10, 15, 20, 21, 22, 23, 24]);
    expect(cells('Small Diamond').flatMap((on, i) => (on ? [i] : []))).toEqual([7, 11, 13, 17]);
    expect(cells('Blackout').every(Boolean)).toBe(true);
  });

  it('is valid and the same every time', () => {
    expect(seeds.every((p) => isPatternCells(p.cells))).toBe(true);
    expect(new Set(seeds.map((p) => p.id)).size).toBe(seeds.length);
    expect(createDefaultLibrary()).toEqual(seeds);
    expect(seeds.every((p) => p.createdAt === SEED_TIMESTAMP && p.updatedAt === SEED_TIMESTAMP)).toBe(true);
  });
});

describe('selecting a pattern', () => {
  it('makes an unedited copy, and a pattern with center off stays off', () => {
    const lib = library();
    const active = selectPattern(lib, 'seed-big-l');
    expect(active).toMatchObject({ sourcePatternId: 'seed-big-l', title: 'Big L', editedFromLibrary: false });
    expect(active.cells).toEqual(findPattern(lib, 'seed-big-l')?.cells);
    expect(centerOf(active.cells)).toBe(false);
    expect(active.cells).not.toBe(findPattern(lib, 'seed-big-l')?.cells);
  });

  it('rejects an unknown pattern', () => {
    expect(() => selectPattern(library(), 'nope')).toThrow(RangeError);
  });

  it('can start from a pattern that is not in the library', () => {
    const active = createActivePattern('  One-off  ', Array(25).fill(false));
    expect(active).toMatchObject({ sourcePatternId: null, title: 'One-off', editedFromLibrary: false });
    // With no template to differ from, it is never "Edited".
    expect(isEdited(toggleCell(active, library(), 3), library())).toBe(false);
  });
});

describe('editing the working copy', () => {
  it('toggles the center on and back off, like any other cell', () => {
    const lib = library();
    const start = selectPattern(lib, 'seed-four-corners');
    expect(centerOf(start.cells)).toBe(false);

    const on = toggleCell(start, lib, CENTER);
    expect(centerOf(on.cells)).toBe(true);
    expect(on.editedFromLibrary).toBe(true);

    const off = toggleCell(on, lib, CENTER);
    expect(centerOf(off.cells)).toBe(false);
    expect(off.editedFromLibrary).toBe(false);
  });

  it('toggles only the cell asked for', () => {
    const lib = library();
    const start = selectPattern(lib, 'seed-four-corners');
    const next = toggleCell(start, lib, 7);
    expect(next.cells.flatMap((on, i) => (on === start.cells[i] ? [] : [i]))).toEqual([7]);
  });

  it('NEVER changes the library, however much it is edited', () => {
    const lib = library();
    const before = structuredClone(lib);
    let active = selectPattern(lib, 'seed-big-l');
    active = toggleCell(active, lib, CENTER);
    active = toggleCell(active, lib, 0);
    active = renameActive(active, lib, 'My L');
    expect(active.editedFromLibrary).toBe(true);
    expect(lib).toEqual(before);
    expect(findPattern(lib, 'seed-big-l')?.title).toBe('Big L');
  });

  it.each([-1, 25, 1.5, Number.NaN, '3', null, undefined])('rejects the invalid cell %j', (index) => {
    const lib = library();
    expect(() => toggleCell(selectPattern(lib, 'seed-big-l'), lib, index as number)).toThrow(RangeError);
  });
});

describe('the Edited flag', () => {
  it('is off when selected, on after a change, and off again when the change is undone', () => {
    const lib = library();
    const selected = selectPattern(lib, 'seed-letter-x');
    expect(isEdited(selected, lib)).toBe(false);

    const changed = toggleCell(selected, lib, 1);
    expect(changed.editedFromLibrary).toBe(true);
    expect(isEdited(changed, lib)).toBe(true);

    expect(toggleCell(changed, lib, 1).editedFromLibrary).toBe(false);
  });

  it('follows the title too: renaming marks it edited, renaming back clears it', () => {
    const lib = library();
    const renamed = renameActive(selectPattern(lib, 'seed-big-l'), lib, 'Corner Hook');
    expect(renamed.editedFromLibrary).toBe(true);
    expect(renameActive(renamed, lib, 'Big L').editedFromLibrary).toBe(false);
  });

  it('trims titles and rejects empty or over-long ones', () => {
    const lib = library();
    const active = selectPattern(lib, 'seed-big-l');
    expect(renameActive(active, lib, '  Big L  ').editedFromLibrary).toBe(false);
    expect(() => renameActive(active, lib, '   ')).toThrow(RangeError);
    expect(() => renameActive(active, lib, 'x'.repeat(MAX_PATTERN_TITLE_LENGTH + 1))).toThrow(RangeError);
    expect(renameActive(active, lib, 'x'.repeat(MAX_PATTERN_TITLE_LENGTH)).title).toHaveLength(
      MAX_PATTERN_TITLE_LENGTH,
    );
  });
});

describe('updating or saving the working copy', () => {
  const edited = (lib: PatternLibrary): ActivePattern =>
    renameActive(toggleCell(selectPattern(lib, 'seed-big-l'), lib, CENTER), lib, 'Big L plus');

  it('Update Saved Pattern writes the copy into its template, and only then', () => {
    const lib = library();
    const active = edited(lib);
    const result = updateSavedPattern(lib, active, NOW);

    const saved = findPattern(result.library, 'seed-big-l');
    expect(saved?.title).toBe('Big L plus');
    expect(saved?.cells).toEqual(active.cells);
    expect(centerOf(saved?.cells ?? [])).toBe(true);
    expect(saved?.updatedAt).toBe(NOW);
    expect(saved?.createdAt).toBe(SEED_TIMESTAMP);
    expect(result.active.editedFromLibrary).toBe(false);
    // Every other pattern, and the input library, are untouched.
    expect(result.library.filter((p) => p.id !== 'seed-big-l')).toEqual(
      lib.filter((p) => p.id !== 'seed-big-l'),
    );
    expect(findPattern(lib, 'seed-big-l')?.title).toBe('Big L');
  });

  it('Update Saved Pattern needs a template to update', () => {
    const oneOff = createActivePattern('One-off', Array(25).fill(true));
    expect(() => updateSavedPattern(library(), oneOff, NOW)).toThrow(RangeError);
  });

  it('Save As New adds a pattern and leaves the original template as it was', () => {
    const lib = library();
    const active = edited(lib);
    const result = saveActiveAsNew(lib, active, { id: 'mine-1', now: NOW });

    expect(result.library).toHaveLength(lib.length + 1);
    expect(findPattern(result.library, 'mine-1')).toMatchObject({
      title: 'Big L plus',
      cells: active.cells,
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect(findPattern(result.library, 'seed-big-l')).toEqual(findPattern(lib, 'seed-big-l'));
    // The copy is now that new pattern's copy, and no longer "Edited".
    expect(result.active).toMatchObject({
      sourcePatternId: 'mine-1',
      title: 'Big L plus',
      editedFromLibrary: false,
    });
  });

  it('Save As New can take a different title, and works for a one-off pattern', () => {
    const lib = library();
    const oneOff = createActivePattern(
      'Draft',
      cellsFromPicture(['X....', '.X...', '..X..', '...X.', '....X']),
    );
    const result = saveActiveAsNew(lib, oneOff, { id: 'mine-2', now: NOW, title: 'Diagonal' });
    expect(findPattern(result.library, 'mine-2')?.title).toBe('Diagonal');
    expect(result.active.sourcePatternId).toBe('mine-2');
  });

  it('Save As New refuses an id that is already taken', () => {
    const lib = library();
    expect(() => saveActiveAsNew(lib, edited(lib), { id: 'seed-big-l', now: NOW })).toThrow(RangeError);
    expect(() => saveActiveAsNew(lib, edited(lib), { id: '', now: NOW })).toThrow(RangeError);
  });
});

describe('the library', () => {
  it('creates a pattern', () => {
    const lib = library();
    const next = createPattern(lib, {
      id: 'new-1',
      title: ' Plus ',
      cells: cellsFromPicture(['..X..', '..X..', 'XXXXX', '..X..', '..X..']),
      now: NOW,
    });
    expect(next).toHaveLength(lib.length + 1);
    expect(findPattern(next, 'new-1')).toMatchObject({ title: 'Plus', createdAt: NOW, updatedAt: NOW });
    expect(() => createPattern(lib, { id: 'new-2', title: 'Bad', cells: [true], now: NOW })).toThrow(
      RangeError,
    );
    expect(() =>
      createPattern(lib, { id: 'seed-big-l', title: 'Dup', cells: Array(25).fill(false), now: NOW }),
    ).toThrow(RangeError);
  });

  it('renames a pattern and stamps updatedAt', () => {
    const lib = library();
    const next = renamePattern(lib, 'seed-big-l', 'Hockey Stick', LATER);
    expect(findPattern(next, 'seed-big-l')).toMatchObject({
      title: 'Hockey Stick',
      updatedAt: LATER,
      createdAt: SEED_TIMESTAMP,
    });
    expect(findPattern(lib, 'seed-big-l')?.title).toBe('Big L');
    expect(() => renamePattern(lib, 'nope', 'X', LATER)).toThrow(RangeError);
    expect(() => renamePattern(lib, 'seed-big-l', '  ', LATER)).toThrow(RangeError);
  });

  it('duplicates a pattern right after the original, as an independent copy', () => {
    const lib = library();
    const next = duplicatePattern(lib, 'seed-big-l', { id: 'copy-1', now: NOW });
    const at = next.findIndex((p) => p.id === 'seed-big-l');
    expect(next[at + 1]).toMatchObject({
      id: 'copy-1',
      title: 'Big L (copy)',
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect(next[at + 1]?.cells).toEqual(findPattern(lib, 'seed-big-l')?.cells);
    expect(next[at + 1]?.cells).not.toBe(findPattern(next, 'seed-big-l')?.cells);
    expect(next).toHaveLength(lib.length + 1);

    // Editing the duplicate in the library does not touch the original.
    const renamed = renamePattern(next, 'copy-1', 'Mine', LATER);
    expect(findPattern(renamed, 'seed-big-l')?.title).toBe('Big L');
  });

  it('keeps a duplicated title within the length limit', () => {
    const lib = createPattern(library(), {
      id: 'long',
      title: 'x'.repeat(MAX_PATTERN_TITLE_LENGTH),
      cells: Array(25).fill(false),
      now: NOW,
    });
    const next = duplicatePattern(lib, 'long', { id: 'long-2', now: NOW });
    const title = findPattern(next, 'long-2')?.title ?? '';
    expect(title.length).toBeLessThanOrEqual(MAX_PATTERN_TITLE_LENGTH);
    expect(title.endsWith(' (copy)')).toBe(true);
  });

  it('deletes a pattern, and only that one', () => {
    const lib = library();
    const next = deletePattern(lib, 'seed-blackout');
    expect(next).toHaveLength(lib.length - 1);
    expect(findPattern(next, 'seed-blackout')).toBeUndefined();
    expect(next).toEqual(lib.filter((p) => p.id !== 'seed-blackout'));
    expect(() => deletePattern(lib, 'seed-blackout-gone')).toThrow(RangeError);
  });
});

describe('keeping the working copy in step with the library', () => {
  it('deleting the template detaches the copy but keeps what the game is showing', () => {
    const lib = library();
    const active = toggleCell(selectPattern(lib, 'seed-big-l'), lib, CENTER);
    const afterDelete = deletePattern(lib, 'seed-big-l');
    const reconciled = reconcileActive(active, afterDelete);
    expect(reconciled.sourcePatternId).toBeNull();
    expect(reconciled.editedFromLibrary).toBe(false);
    expect(reconciled.title).toBe(active.title);
    expect(reconciled.cells).toEqual(active.cells);
  });

  it('deleting a different pattern changes nothing', () => {
    const lib = library();
    const active = toggleCell(selectPattern(lib, 'seed-big-l'), lib, CENTER);
    expect(reconcileActive(active, deletePattern(lib, 'seed-blackout'))).toEqual(active);
  });

  it('renaming the template in the library makes an unedited copy count as edited', () => {
    const lib = library();
    const active = selectPattern(lib, 'seed-big-l');
    const renamed = renamePattern(lib, 'seed-big-l', 'Hockey Stick', LATER);
    expect(reconcileActive(active, renamed).editedFromLibrary).toBe(true);
  });
});
