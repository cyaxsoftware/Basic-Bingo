import { describe, expect, it } from 'vitest';
import {
  BLANK_ACTIVE_TITLE,
  blankActivePattern,
  cellsFromPicture,
  createDefaultLibrary,
  findPattern,
  reducePatterns,
  type PatternCommand,
  type PatternContext,
  type PatternsState,
} from './index';

const CENTER = 12;
const NOW = '2026-11-22T12:00:00.000Z';

function context(): PatternContext {
  let n = 0;
  return { now: NOW, newId: () => `id-${(n += 1)}` };
}

const start = (): PatternsState => ({ library: createDefaultLibrary(), active: blankActivePattern() });
const run = (state: PatternsState, command: PatternCommand, ctx = context()) =>
  reducePatterns(state, command, ctx);

describe('reducePatterns', () => {
  it('starts from an empty one-off working pattern', () => {
    const { active } = start();
    expect(active).toMatchObject({
      sourcePatternId: null,
      title: BLANK_ACTIVE_TITLE,
      editedFromLibrary: false,
    });
    expect(active.cells.some(Boolean)).toBe(false);
  });

  it('selectPattern shows an unedited copy of the library pattern', () => {
    const next = run(start(), { type: 'selectPattern', patternId: 'seed-big-l' });
    expect(next.active).toMatchObject({
      sourcePatternId: 'seed-big-l',
      title: 'Big L',
      editedFromLibrary: false,
    });
    expect(next.active.cells[CENTER]).toBe(false);
  });

  it('setActivePatternCell sets a cell on or off, the center included, and never touches the library', () => {
    const selected = run(start(), { type: 'selectPattern', patternId: 'seed-big-l' });
    const on = run(selected, { type: 'setActivePatternCell', index: CENTER, on: true });
    expect(on.active.cells[CENTER]).toBe(true);
    expect(on.active.editedFromLibrary).toBe(true);
    expect(on.library).toBe(selected.library);
    expect(findPattern(on.library, 'seed-big-l')?.cells[CENTER]).toBe(false);

    const off = run(on, { type: 'setActivePatternCell', index: CENTER, on: false });
    expect(off.active.cells[CENTER]).toBe(false);
    expect(off.active.editedFromLibrary).toBe(false);
  });

  it('setActivePatternCell is idempotent: asking for the state a cell is already in changes nothing', () => {
    const selected = run(start(), { type: 'selectPattern', patternId: 'seed-big-l' });
    expect(run(selected, { type: 'setActivePatternCell', index: CENTER, on: false })).toBe(selected);
    expect(run(selected, { type: 'setActivePatternCell', index: 0, on: true })).toBe(selected);
  });

  it.each([-1, 25, 12.5, Number.NaN, '3', null])('setActivePatternCell rejects the cell %j', (index) => {
    expect(() => run(start(), { type: 'setActivePatternCell', index: index as number, on: true })).toThrow(
      RangeError,
    );
  });

  it.each(['true', 1, null, undefined])('setActivePatternCell rejects on = %j', (on) => {
    expect(() =>
      run(start(), { type: 'setActivePatternCell', index: 3, on: on as unknown as boolean }),
    ).toThrow(RangeError);
  });

  it('renameActivePattern renames only the working copy', () => {
    const selected = run(start(), { type: 'selectPattern', patternId: 'seed-big-l' });
    const renamed = run(selected, { type: 'renameActivePattern', title: '  Hockey Stick ' });
    expect(renamed.active).toMatchObject({ title: 'Hockey Stick', editedFromLibrary: true });
    expect(findPattern(renamed.library, 'seed-big-l')?.title).toBe('Big L');
    // Naming it what it already is changes nothing.
    expect(run(selected, { type: 'renameActivePattern', title: 'Big L' })).toBe(selected);
  });

  it('updateSavedPattern writes the working copy into its template; saveActivePatternAsNew adds a pattern', () => {
    let state = run(start(), { type: 'selectPattern', patternId: 'seed-big-l' });
    state = run(state, { type: 'setActivePatternCell', index: CENTER, on: true });

    const updated = run(state, { type: 'updateSavedPattern' });
    expect(findPattern(updated.library, 'seed-big-l')?.cells[CENTER]).toBe(true);
    expect(findPattern(updated.library, 'seed-big-l')?.updatedAt).toBe(NOW);
    expect(updated.active.editedFromLibrary).toBe(false);

    const saved = run(state, { type: 'saveActivePatternAsNew', title: 'My L' }, context());
    expect(saved.library).toHaveLength(state.library.length + 1);
    expect(findPattern(saved.library, 'id-1')).toMatchObject({ title: 'My L', createdAt: NOW });
    expect(saved.active).toMatchObject({ sourcePatternId: 'id-1', title: 'My L', editedFromLibrary: false });
    // The original template is as it was.
    expect(findPattern(saved.library, 'seed-big-l')?.cells[CENTER]).toBe(false);
  });

  it('saveActivePatternAsNew defaults to the working copy title', () => {
    const state = run(start(), { type: 'selectPattern', patternId: 'seed-big-l' });
    const saved = run(state, { type: 'saveActivePatternAsNew' });
    expect(findPattern(saved.library, 'id-1')?.title).toBe('Big L');
  });

  it('updateSavedPattern fails for a pattern that is not in the library', () => {
    expect(() => run(start(), { type: 'updateSavedPattern' })).toThrow(RangeError);
  });

  it('createPattern, renamePattern, duplicatePattern and deletePattern change the library', () => {
    const ctx = context();
    const cells = cellsFromPicture(['..X..', '..X..', 'XXXXX', '..X..', '..X..']);
    let state = run(start(), { type: 'createPattern', title: 'Plus', cells }, ctx);
    expect(findPattern(state.library, 'id-1')).toMatchObject({ title: 'Plus', cells });

    state = run(state, { type: 'renamePattern', patternId: 'id-1', title: 'Plus Sign' }, ctx);
    expect(findPattern(state.library, 'id-1')?.title).toBe('Plus Sign');

    state = run(state, { type: 'duplicatePattern', patternId: 'id-1' }, ctx);
    expect(findPattern(state.library, 'id-2')?.title).toBe('Plus Sign (copy)');

    state = run(state, { type: 'deletePattern', patternId: 'id-1' }, ctx);
    expect(findPattern(state.library, 'id-1')).toBeUndefined();
    expect(findPattern(state.library, 'id-2')).toBeDefined();
  });

  it('keeps the working copy in step: deleting its template detaches it, renaming the template marks it edited', () => {
    const selected = run(start(), { type: 'selectPattern', patternId: 'seed-big-l' });

    const renamedTemplate = run(selected, { type: 'renamePattern', patternId: 'seed-big-l', title: 'Hook' });
    expect(renamedTemplate.active.editedFromLibrary).toBe(true);

    const withEdit = run(selected, { type: 'setActivePatternCell', index: CENTER, on: true });
    const deleted = run(withEdit, { type: 'deletePattern', patternId: 'seed-big-l' });
    expect(deleted.active).toMatchObject({ sourcePatternId: null, title: 'Big L', editedFromLibrary: false });
    expect(deleted.active.cells[CENTER]).toBe(true);
  });

  it.each<[string, PatternCommand]>([
    ['select an unknown pattern', { type: 'selectPattern', patternId: 'nope' }],
    ['rename an unknown pattern', { type: 'renamePattern', patternId: 'nope', title: 'X' }],
    ['duplicate an unknown pattern', { type: 'duplicatePattern', patternId: 'nope' }],
    ['delete an unknown pattern', { type: 'deletePattern', patternId: 'nope' }],
    ['rename the working copy to nothing', { type: 'renameActivePattern', title: '   ' }],
    ['rename the working copy to something too long', { type: 'renameActivePattern', title: 'x'.repeat(61) }],
    ['create a pattern with too few cells', { type: 'createPattern', title: 'Short', cells: [true] }],
    ['create a pattern with no title', { type: 'createPattern', title: '', cells: Array(25).fill(false) }],
  ])('rejects: %s', (_what, command) => {
    expect(() => run(start(), command)).toThrow(RangeError);
  });

  it('throws on an unknown command type', () => {
    expect(() => run(start(), { type: 'explode' } as unknown as PatternCommand)).toThrow(
      /Unhandled pattern command/,
    );
  });
});
