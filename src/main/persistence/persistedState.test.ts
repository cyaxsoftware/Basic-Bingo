import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  BLANK_ACTIVE_TITLE,
  blankActivePattern,
  createDefaultLibrary,
  isValidPatternId,
  reducePatterns,
} from '../../shared/patterns';
import stateV1Fixture from './fixtures/state-v1.json';
import stateV2Fixture from './fixtures/state-v2.json';
import stateV3Fixture from './fixtures/state-v3.json';
import {
  CURRENT_SCHEMA_VERSION,
  createDefaultAppData,
  createDefaultPersistedState,
  fromPersistedState,
  parsePersistedState,
  toPersistedState,
  type AppData,
  type PersistedGameV1,
  type PersistedGameV2,
  type PersistedStateV1,
  type PersistedStateV2,
} from './persistedState';
import { JsonStateRepository } from './stateRepository';

const CENTER = 12;
const CONTEXT = {
  now: '2026-11-22T12:00:00.000Z',
  newId: (() => {
    let n = 0;
    return () => `new-${(n += 1)}`;
  })(),
};

// Older files predate patterns, so they come back with the default library and an empty working pattern.
const DEFAULT_PATTERNS = { library: createDefaultLibrary(), active: blankActivePattern() };

// A V1 file predates the banner, so it must come back with the banner hidden.
const V1_FIXTURE_APP_DATA: AppData = {
  game: { calledNumbers: [3, 17, 9, 31, 52, 75], bingoBannerVisible: false },
  presentation: { mode: 'gameBoard' },
  patterns: DEFAULT_PATTERNS,
  settings: { preferredDisplayId: 2779098405 },
};

const V2_FIXTURE_APP_DATA: AppData = {
  game: { calledNumbers: [3, 17, 9, 31, 52, 75], bingoBannerVisible: true },
  presentation: { mode: 'slideshow' },
  patterns: DEFAULT_PATTERNS,
  settings: { preferredDisplayId: 2779098405 },
};

describe('V1 save format is frozen (audit finding 5, #22)', () => {
  it('keeps its own game shape, independent of the live GameState', () => {
    // Type-level guard (checked by `npm run typecheck`): editing GameState must not change V1.
    expectTypeOf<PersistedGameV1>().toEqualTypeOf<{ readonly calledNumbers: readonly number[] }>();
    expectTypeOf<PersistedStateV1['game']>().toEqualTypeOf<PersistedGameV1>();
  });

  it('loads the representative V1 fixture into the current app data, banner hidden', () => {
    const parsed = parsePersistedState(stateV1Fixture);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.warnings).toEqual([]);
    expect(fromPersistedState(parsed.state)).toEqual(V1_FIXTURE_APP_DATA);
  });

  it('loads the V1 fixture from disk through the repository', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'bingo-v1-'));
    try {
      const repo = new JsonStateRepository(dir);
      await copyFile(path.join(__dirname, 'fixtures', 'state-v1.json'), repo.filePath);
      const loaded = await repo.load();
      expect(loaded.source).toBe('primary');
      expect(fromPersistedState(loaded.state)).toEqual(V1_FIXTURE_APP_DATA);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('keeps the frozen V1 type free of V2 fields', () => {
    expectTypeOf<PersistedGameV1>().not.toHaveProperty('bingoBannerVisible');
  });

  it.each([
    ['a V1 game with calls', { calledNumbers: [4, 5] }, [4, 5]],
    ['a V1 game with no calls', { calledNumbers: [] }, []],
  ])(
    'migrates %s to V3 with the banner hidden, the board showing and the default patterns',
    (_name, game, expectedCalls) => {
      const result = parsePersistedState({
        schemaVersion: 1,
        savedAt: '2026-01-01T00:00:00.000Z',
        game,
        settings: { preferredDisplayId: null },
      });
      expect(result).toEqual({
        ok: true,
        warnings: [],
        state: {
          schemaVersion: 3,
          savedAt: '2026-01-01T00:00:00.000Z',
          game: { calledNumbers: expectedCalls, bingoBannerVisible: false },
          presentation: { mode: 'gameBoard' },
          patterns: createDefaultPersistedState().patterns,
          settings: { preferredDisplayId: null },
        },
      });
    },
  );

  it('still rejects a malformed V1 game section after migration', () => {
    expect(parsePersistedState({ schemaVersion: 1, game: 'oops' }).ok).toBe(false);
    expect(parsePersistedState({ schemaVersion: 1 }).ok).toBe(false);
    expect(parsePersistedState({ schemaVersion: 1, game: { calledNumbers: 'x' } }).ok).toBe(false);
  });
});

describe('V2 save format is frozen (released in milestone 2)', () => {
  it('has the expected shape', () => {
    expectTypeOf<PersistedGameV2>().toEqualTypeOf<{
      readonly calledNumbers: readonly number[];
      readonly bingoBannerVisible: boolean;
    }>();
    expectTypeOf<PersistedStateV2['schemaVersion']>().toEqualTypeOf<2>();
    // V2 predates patterns, and must stay that way.
    expectTypeOf<PersistedStateV2>().not.toHaveProperty('patterns');
  });

  it('loads the V2 fixture into the current app data, with the default patterns', () => {
    const parsed = parsePersistedState(stateV2Fixture);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.warnings).toEqual([]);
    expect(fromPersistedState(parsed.state)).toEqual(V2_FIXTURE_APP_DATA);
  });

  it('loads the V2 fixture from disk through the repository', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'bingo-v2-'));
    try {
      const repo = new JsonStateRepository(dir);
      await copyFile(path.join(__dirname, 'fixtures', 'state-v2.json'), repo.filePath);
      const loaded = await repo.load();
      expect(loaded.source).toBe('primary');
      expect(fromPersistedState(loaded.state)).toEqual(V2_FIXTURE_APP_DATA);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('migrates to V3 keeping the game and mode, and seeds the default library with an empty working pattern', () => {
    const parsed = parsePersistedState(stateV2Fixture);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.state.schemaVersion).toBe(3);
    expect(parsed.state.game).toEqual({ calledNumbers: [3, 17, 9, 31, 52, 75], bingoBannerVisible: true });
    expect(parsed.state.presentation.mode).toBe('slideshow');
    expect(parsed.state.patterns.library.map((p) => p.title)).toEqual([
      'Four Corners',
      'Big L',
      'Letter X',
      'Blackout',
      'Small Diamond',
    ]);
    expect(parsed.state.patterns.active).toEqual({
      sourcePatternId: null,
      title: BLANK_ACTIVE_TITLE,
      cells: Array(25).fill(false),
      editedFromLibrary: false,
    });
  });

  it.each([undefined, null, 'photos', 3, {}, { mode: 'photos' }, { mode: 7 }])(
    'falls back to the game board for the invalid presentation section %j',
    (presentation) => {
      const result = parsePersistedState({
        schemaVersion: 2,
        game: { calledNumbers: [1] },
        presentation,
      });
      expect(result.ok && result.state.presentation.mode).toBe('gameBoard');
      // The game itself is never lost over a bad display setting.
      expect(result.ok && result.state.game.calledNumbers).toEqual([1]);
    },
  );

  it('treats a missing or non-boolean banner flag as hidden', () => {
    for (const bingoBannerVisible of [undefined, 'yes', 1, null]) {
      const result = parsePersistedState({
        schemaVersion: 2,
        game: { calledNumbers: [1], bingoBannerVisible },
      });
      expect(result.ok && result.state.game.bingoBannerVisible).toBe(false);
    }
  });
});

describe('V3 save format (milestone 3, unreleased)', () => {
  const loadFixture = () => {
    const parsed = parsePersistedState(stateV3Fixture);
    if (!parsed.ok) throw new Error(parsed.error);
    return parsed;
  };

  it('loads the V3 fixture: a custom library pattern and an edited working copy', () => {
    const parsed = loadFixture();
    expect(parsed.warnings).toEqual([]);
    const { patterns, game, presentation } = fromPersistedState(parsed.state);
    expect(patterns.library.map((p) => p.title)).toEqual(['Four Corners', 'Big L', 'Plus Sign']);
    // The saved Big L is untouched, with the center off; only the working copy has it on.
    expect(patterns.library[1]?.cells[CENTER]).toBe(false);
    expect(patterns.library[2]?.cells[CENTER]).toBe(true);
    expect(patterns.active).toMatchObject({
      sourcePatternId: 'seed-big-l',
      title: 'Big L plus',
      editedFromLibrary: true,
    });
    expect(patterns.active.cells[CENTER]).toBe(true);
    expect(game.bingoBannerVisible).toBe(true);
    expect(presentation.mode).toBe('slideshow');
  });

  it('round-trips the V3 fixture exactly (apart from the save time)', () => {
    const parsed = loadFixture();
    const written = toPersistedState(fromPersistedState(parsed.state));
    expect({ ...written, savedAt: stateV3Fixture.savedAt }).toEqual(stateV3Fixture);
  });

  it('loads the V3 fixture from disk through the repository', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'bingo-v3-'));
    try {
      const repo = new JsonStateRepository(dir);
      await copyFile(path.join(__dirname, 'fixtures', 'state-v3.json'), repo.filePath);
      const loaded = await repo.load();
      expect(loaded.source).toBe('primary');
      expect(loaded.issues).toEqual([]);
      expect(fromPersistedState(loaded.state).patterns.active.title).toBe('Big L plus');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('survives being saved and loaded again: an edited working copy and a new library pattern', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'bingo-v3-save-'));
    try {
      const repo = new JsonStateRepository(dir);
      let patterns = createDefaultAppData().patterns;
      patterns = reducePatterns(patterns, { type: 'selectPattern', patternId: 'seed-big-l' }, CONTEXT);
      patterns = reducePatterns(patterns, { type: 'setActivePatternCell', index: CENTER, on: true }, CONTEXT);
      patterns = reducePatterns(patterns, { type: 'renameActivePattern', title: 'Big L plus' }, CONTEXT);
      patterns = reducePatterns(
        patterns,
        { type: 'createPattern', title: 'Mine', cells: Array(25).fill(true) },
        CONTEXT,
      );
      await repo.save(toPersistedState({ ...createDefaultAppData(), patterns }));

      const loaded = fromPersistedState((await new JsonStateRepository(dir).load()).state);
      expect(loaded.patterns).toEqual(patterns);
      expect(loaded.patterns.active).toMatchObject({ title: 'Big L plus', editedFromLibrary: true });
      expect(loaded.patterns.library.at(-1)).toMatchObject({ id: 'new-1', title: 'Mine' });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('writes the banner, calls and patterns, and nothing else from the game', () => {
    const grown = {
      ...createDefaultAppData(),
      game: { calledNumbers: [1, 2], bingoBannerVisible: true, somethingNew: 1 },
      presentation: { mode: 'countdown' },
    } as AppData;
    const written = toPersistedState(grown, new Date('2026-01-01T00:00:00Z'));
    expect(written.game).toEqual({ calledNumbers: [1, 2], bingoBannerVisible: true });
    expect(written.presentation).toEqual({ mode: 'countdown' });
    expect(written.savedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(written.patterns).toEqual(createDefaultPersistedState().patterns);
  });

  it('round-trips app data through the current document', () => {
    for (const data of [V1_FIXTURE_APP_DATA, V2_FIXTURE_APP_DATA, createDefaultAppData()]) {
      expect(fromPersistedState(toPersistedState(data))).toEqual(data);
    }
  });

  describe('damaged pattern data never costs the game', () => {
    const document = (patterns: unknown) => ({
      schemaVersion: 3,
      game: { calledNumbers: [3, 9], bingoBannerVisible: true },
      patterns,
    });
    const good = (id: string, title = id) => ({
      id,
      title,
      cells: Array(25).fill(false),
      createdAt: 'a',
      updatedAt: 'b',
    });
    const blank = {
      sourcePatternId: null,
      title: 'Draft',
      cells: Array(25).fill(false),
      editedFromLibrary: false,
    };

    function parse(patterns: unknown) {
      const result = parsePersistedState(document(patterns));
      if (!result.ok) throw new Error(result.error);
      return result;
    }

    it.each([undefined, null, 'oops', 7, [], {}, { library: 'x' }, { library: {} }])(
      'restores the default patterns, with a warning, for the section %j',
      (patterns) => {
        const result = parse(patterns);
        expect(result.state.patterns.library).toHaveLength(createDefaultLibrary().length);
        expect(result.warnings.join(' ')).toMatch(/default patterns were restored/);
        expect(result.state.game.calledNumbers).toEqual([3, 9]);
        expect(result.state.game.bingoBannerVisible).toBe(true);
      },
    );

    it('drops only the damaged entries, with a warning, and keeps the rest', () => {
      const sparse: boolean[] = [];
      sparse.length = 25;
      sparse[0] = true;
      const result = parse({
        library: [
          good('keep-1'),
          { ...good('short'), cells: [true, false] },
          { ...good('sparse'), cells: sparse },
          { ...good('not-booleans'), cells: Array(25).fill(1) },
          { ...good('no-title'), title: '   ' },
          { ...good('long-title'), title: 'x'.repeat(61) },
          { ...good(''), id: '' },
          'garbage',
          null,
          good('keep-2'),
          good('keep-1', 'duplicate id'),
        ],
        active: blank,
      });
      expect(result.state.patterns.library.map((p) => p.id)).toEqual(['keep-1', 'keep-2']);
      expect(result.warnings.join(' ')).toMatch(/Removed 9 damaged or duplicate saved pattern/);
    });

    it('respects a deliberately empty library', () => {
      const result = parse({ library: [], active: blank });
      expect(result.state.patterns.library).toEqual([]);
      expect(result.warnings).toEqual([]);
    });

    it.each([
      undefined,
      null,
      'x',
      { title: 'No cells' },
      { ...blank, cells: [true] },
      { ...blank, title: '' },
    ])('resets a damaged working pattern, with a warning, for %j', (active) => {
      const result = parse({ library: [good('a')], active });
      expect(result.state.patterns.active).toEqual(
        fromPersistedState(parse(undefined).state).patterns.active,
      );
      expect(result.warnings.join(' ')).toMatch(/active pattern was missing or damaged/);
      expect(result.state.patterns.library.map((p) => p.id)).toEqual(['a']);
    });

    it.each([undefined, null, 'oops', 7, {}])(
      'keeps a valid working copy next to an unreadable library (%j)',
      (library) => {
        const edited = {
          sourcePatternId: 'seed-big-l',
          title: 'Big L plus',
          cells: [true, ...Array(11).fill(false), true, ...Array(12).fill(false)],
          editedFromLibrary: false,
        };
        const result = parse({ library, active: edited });
        expect(result.state.patterns.library).toHaveLength(createDefaultLibrary().length);
        expect(result.warnings.join(' ')).toMatch(/default patterns were restored/);
        expect(result.warnings.join(' ')).not.toMatch(/active pattern/);
        // Still attached to the reseeded template, and shown as edited.
        expect(result.state.patterns.active).toMatchObject({
          sourcePatternId: 'seed-big-l',
          title: 'Big L plus',
          editedFromLibrary: true,
        });
        expect(result.state.patterns.active.cells).toEqual(edited.cells);
      },
    );

    it('resets only the working copy when both it and the library are damaged', () => {
      const result = parse({ library: 'x', active: 'y' });
      expect(result.state.patterns.library).toHaveLength(createDefaultLibrary().length);
      expect(result.warnings.join(' ')).toMatch(/default patterns were restored/);
      expect(result.warnings.join(' ')).toMatch(/active pattern was missing or damaged/);
    });

    it('loads exactly the ids the IPC rule accepts', () => {
      for (const length of [1, 199, 200, 201, 500]) {
        const id = 'x'.repeat(length);
        const kept = parse({ library: [good(id, 'T')], active: blank }).state.patterns.library.length === 1;
        expect(kept, `id of ${length} characters`).toBe(isValidPatternId(id));
      }
      expect(isValidPatternId('x'.repeat(200))).toBe(true);
      expect(isValidPatternId('x'.repeat(201))).toBe(false);
    });

    it('drops a pattern with a too-long id, and detaches a working copy pointing at one', () => {
      const tooLong = 'x'.repeat(201);
      const result = parse({
        library: [good('keep'), good(tooLong, 'T')],
        active: { ...blank, sourcePatternId: tooLong },
      });
      expect(result.state.patterns.library.map((p) => p.id)).toEqual(['keep']);
      expect(result.warnings.join(' ')).toMatch(/Removed 1 damaged or duplicate saved pattern/);
      expect(result.state.patterns.active.sourcePatternId).toBeNull();
    });

    it('recomputes "Edited" from the library instead of trusting the file', () => {
      const lib = [good('a', 'Alpha')];
      const unedited = {
        sourcePatternId: 'a',
        title: 'Alpha',
        cells: Array(25).fill(false),
        editedFromLibrary: true,
      };
      expect(parse({ library: lib, active: unedited }).state.patterns.active.editedFromLibrary).toBe(false);

      const edited = { ...unedited, cells: [true, ...Array(24).fill(false)], editedFromLibrary: false };
      expect(parse({ library: lib, active: edited }).state.patterns.active.editedFromLibrary).toBe(true);
    });

    it('detaches a working pattern whose template is gone, keeping what it shows', () => {
      const orphan = {
        sourcePatternId: 'deleted',
        title: 'Still here',
        cells: [true, ...Array(24).fill(false)],
        editedFromLibrary: true,
      };
      const active = parse({ library: [good('a')], active: orphan }).state.patterns.active;
      expect(active).toMatchObject({ sourcePatternId: null, title: 'Still here', editedFromLibrary: false });
      expect(active.cells[0]).toBe(true);
    });
  });
});

describe('parsePersistedState', () => {
  it('accepts a valid current document', () => {
    const result = parsePersistedState({
      schemaVersion: 3,
      savedAt: '2026-01-01T00:00:00.000Z',
      game: { calledNumbers: [3, 17, 9], bingoBannerVisible: true },
      presentation: { mode: 'singleImage' },
      patterns: createDefaultPersistedState().patterns,
      settings: { preferredDisplayId: 12 },
    });
    expect(result).toEqual({
      ok: true,
      warnings: [],
      state: {
        schemaVersion: 3,
        savedAt: '2026-01-01T00:00:00.000Z',
        game: { calledNumbers: [3, 17, 9], bingoBannerVisible: true },
        presentation: { mode: 'singleImage' },
        patterns: createDefaultPersistedState().patterns,
        settings: { preferredDisplayId: 12 },
      },
    });
  });

  it('defaults a missing or invalid settings section', () => {
    const result = parsePersistedState({ schemaVersion: 2, game: { calledNumbers: [] }, settings: 'x' });
    expect(result.ok && result.state.settings.preferredDisplayId).toBeNull();
  });

  it.each([null, [], 'text', 42])('rejects non-object input %j', (raw) => {
    expect(parsePersistedState(raw).ok).toBe(false);
  });

  it('rejects a missing game section', () => {
    expect(parsePersistedState({ schemaVersion: 3 }).ok).toBe(false);
  });

  it('rejects unknown or newer schema versions', () => {
    expect(parsePersistedState({ schemaVersion: 0, game: { calledNumbers: [] } }).ok).toBe(false);
    expect(parsePersistedState({ schemaVersion: '1', game: { calledNumbers: [] } }).ok).toBe(false);
    const newer = parsePersistedState({
      schemaVersion: CURRENT_SCHEMA_VERSION + 1,
      game: { calledNumbers: [] },
    });
    expect(newer.ok).toBe(false);
  });

  it('creates a default state: an empty game, the default patterns and an empty working pattern', () => {
    const state = createDefaultPersistedState(new Date('2026-01-01T00:00:00Z'));
    expect(state).toMatchObject({
      schemaVersion: 3,
      savedAt: '2026-01-01T00:00:00.000Z',
      game: { calledNumbers: [], bingoBannerVisible: false },
      presentation: { mode: 'gameBoard' },
      settings: { preferredDisplayId: null },
    });
    expect(state.patterns.library).toHaveLength(createDefaultLibrary().length);
    expect(state.patterns.active.sourcePatternId).toBeNull();
    expect(state.patterns.active.cells.some(Boolean)).toBe(false);
  });
});
