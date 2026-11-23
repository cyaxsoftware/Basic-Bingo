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
import { DEFAULT_TIMER } from '../../shared/timer/timerState';
import { EMPTY_SLIDESHOW, type SlideshowState } from '../../shared/media/slideshow';
import stateV1Fixture from './fixtures/state-v1.json';
import stateV2Fixture from './fixtures/state-v2.json';
import stateV3Fixture from './fixtures/state-v3.json';
import stateV4Fixture from './fixtures/state-v4.json';
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
  type PersistedStateV3,
} from './persistedState';
import { JsonStateRepository } from './stateRepository';

describe('V4 countdown restoration', () => {
  const targetAt = Date.parse('2026-11-22T12:00:00.000Z');
  const running = { durationSeconds: 15, message: 'Doors open in…', status: 'running', targetAt } as const;

  it('keeps a future target through a save and restores it as expired at or after the deadline', () => {
    const written = toPersistedState(
      { ...createDefaultAppData(), timer: running },
      new Date(targetAt - 7000),
    );
    const parsed = parsePersistedState(written);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(fromPersistedState(parsed.state, new Date(targetAt - 1)).timer).toEqual(running);
    for (const now of [targetAt, targetAt + 1]) {
      expect(fromPersistedState(parsed.state, new Date(now)).timer).toEqual({
        durationSeconds: 15,
        message: 'Doors open in…',
        status: 'expired',
      });
    }
  });

  it('retains a paused remainder to the millisecond regardless of time away', () => {
    const timer = {
      durationSeconds: 15,
      message: 'Doors open in…',
      status: 'paused',
      remainingMs: 7132,
    } as const;
    const parsed = parsePersistedState(toPersistedState({ ...createDefaultAppData(), timer }));
    if (!parsed.ok) throw new Error(parsed.error);
    expect(fromPersistedState(parsed.state, new Date(targetAt + 86_400_000)).timer).toEqual(timer);
  });

  it.each([
    null,
    'running',
    { ...running, status: 'invalid' },
    { ...running, targetAt: 'later' },
    { ...running, durationSeconds: 0 },
    { ...running, message: ' ' },
    { ...running, status: 'paused', remainingMs: -1 },
  ])('recovers damaged timer %j without losing the game', (timer) => {
    const parsed = parsePersistedState({ ...stateV4Fixture, timer });
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.state.game).toEqual(stateV4Fixture.game);
    expect(parsed.state.timer).toEqual(DEFAULT_TIMER);
    expect(parsed.warnings).toEqual([expect.stringContaining('saved countdown was damaged')]);
  });
});

const CENTER = 12;
const CONTEXT = {
  now: '2026-11-22T12:00:00.000Z',
  newId: (() => {
    let n = 0;
    return () => `new-${(n += 1)}`;
  })(),
};

// Older files predate patterns, so they come back with the default library and an empty working pattern.
const DEFAULT_MEDIA = { library: [], singleImage: { imageId: null } };
const DEFAULT_PATTERNS = { library: createDefaultLibrary(), active: blankActivePattern(), shown: null };

// A V1 file predates the banner, so it must come back with the banner hidden.
const V1_FIXTURE_APP_DATA: AppData = {
  game: { calledNumbers: [3, 17, 9, 31, 52, 75], bingoBannerVisible: false, disabledRows: [] },
  presentation: { mode: 'gameBoard' },
  patterns: DEFAULT_PATTERNS,
  media: DEFAULT_MEDIA,
  timer: DEFAULT_TIMER,
  slideshow: EMPTY_SLIDESHOW,
  settings: { preferredDisplayId: 2779098405, controllerTheme: 'light' },
};

const V2_FIXTURE_APP_DATA: AppData = {
  game: { calledNumbers: [3, 17, 9, 31, 52, 75], bingoBannerVisible: true, disabledRows: [] },
  presentation: { mode: 'slideshow' },
  patterns: DEFAULT_PATTERNS,
  media: DEFAULT_MEDIA,
  timer: DEFAULT_TIMER,
  slideshow: EMPTY_SLIDESHOW,
  settings: { preferredDisplayId: 2779098405, controllerTheme: 'light' },
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
          schemaVersion: 4,
          savedAt: '2026-01-01T00:00:00.000Z',
          game: { calledNumbers: expectedCalls, bingoBannerVisible: false, disabledRows: [] },
          presentation: { mode: 'gameBoard' },
          patterns: createDefaultPersistedState().patterns,
          media: createDefaultPersistedState().media,
          timer: DEFAULT_TIMER,
          slideshow: EMPTY_SLIDESHOW,
          settings: { preferredDisplayId: null, controllerTheme: 'light' },
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

  it('migrates to the current version keeping the game and mode, and seeds the default library with an empty working pattern', () => {
    const parsed = parsePersistedState(stateV2Fixture);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.state.schemaVersion).toBe(4);
    expect(parsed.state.game).toEqual({
      calledNumbers: [3, 17, 9, 31, 52, 75],
      bingoBannerVisible: true,
      disabledRows: [],
    });
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
        game: { calledNumbers: [1], bingoBannerVisible, disabledRows: [] },
      });
      expect(result.ok && result.state.game.bingoBannerVisible).toBe(false);
    }
  });
});

describe('V3 save format is frozen (released in milestone 3)', () => {
  it('has the expected shape: patterns, but no media library', () => {
    expectTypeOf<PersistedStateV3['schemaVersion']>().toEqualTypeOf<3>();
    expectTypeOf<PersistedStateV3>().toHaveProperty('patterns');
    expectTypeOf<PersistedStateV3>().not.toHaveProperty('media');
  });

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
    // The projector still shows Big L as it was pushed, not the edited working copy.
    expect(patterns.shown?.title).toBe('Big L');
    expect(patterns.shown?.cells[CENTER]).toBe(false);
    expect(game.bingoBannerVisible).toBe(true);
    expect(game.disabledRows).toEqual(['N']);
    expect(presentation.mode).toBe('slideshow');
  });

  it('migrates the V3 fixture to V4 unchanged, with an empty media library', () => {
    const parsed = loadFixture();
    const written = toPersistedState(fromPersistedState(parsed.state));
    expect({ ...written, savedAt: stateV3Fixture.savedAt }).toEqual({
      ...stateV3Fixture,
      schemaVersion: 4,
      // A file from before the theme switch existed opens in the light theme.
      settings: { ...stateV3Fixture.settings, controllerTheme: 'light' },
      media: { library: [], singleImage: { imageId: null } },
      timer: DEFAULT_TIMER,
      slideshow: EMPTY_SLIDESHOW,
    });
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

  it('writes the banner, calls, blacked-out rows and patterns, and nothing else from the game', () => {
    const grown = {
      ...createDefaultAppData(),
      game: { calledNumbers: [1, 2], bingoBannerVisible: true, disabledRows: ['B'], somethingNew: 1 },
      presentation: { mode: 'countdown' },
    } as AppData;
    const written = toPersistedState(grown, new Date('2026-01-01T00:00:00Z'));
    expect(written.game).toEqual({ calledNumbers: [1, 2], bingoBannerVisible: true, disabledRows: ['B'] });
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
      game: { calledNumbers: [3, 9], bingoBannerVisible: true, disabledRows: [] },
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

    it('loads without a pushed pattern when the field is missing, with no warning', () => {
      const result = parse({ library: [good('a')], active: blank });
      expect(result.state.patterns.shown).toBeNull();
      expect(result.warnings).toEqual([]);
    });

    it('keeps a valid pushed pattern, separate from the working copy', () => {
      const shown = { title: 'On the wall', cells: [true, ...Array(24).fill(false)] };
      const result = parse({ library: [good('a')], active: blank, shown });
      expect(result.state.patterns.shown).toEqual(shown);
      expect(result.state.patterns.active.title).toBe('Draft');
    });

    it.each([
      'oops',
      7,
      { title: 'No cells' },
      { title: '', cells: Array(25).fill(false) },
      { title: 'Short', cells: [true] },
    ])('clears a damaged pushed pattern with a warning, keeping the rest (%j)', (shown) => {
      const result = parse({ library: [good('a')], active: blank, shown });
      expect(result.state.patterns.shown).toBeNull();
      expect(result.warnings.join(' ')).toMatch(/shown on the projector was damaged/);
      expect(result.state.patterns.library.map((p) => p.id)).toEqual(['a']);
      expect(result.state.game.calledNumbers).toEqual([3, 9]);
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

describe('blacked-out rows in the save file', () => {
  const document = (game: Record<string, unknown>) => ({
    schemaVersion: 3,
    game: { calledNumbers: [3], bingoBannerVisible: false, ...game },
    patterns: undefined,
  });
  const load = (game: Record<string, unknown>) => {
    const result = parsePersistedState(document(game));
    if (!result.ok) throw new Error(result.error);
    return result.state.game.disabledRows;
  };

  it('round-trips through app data', () => {
    const data = {
      ...createDefaultAppData(),
      game: { ...createDefaultAppData().game, disabledRows: ['B', 'O'] as const },
    };
    expect(fromPersistedState(toPersistedState(data)).game.disabledRows).toEqual(['B', 'O']);
  });

  it('reads them from the file, and none when the field is missing (an older V3 file or a V2 file)', () => {
    expect(load({ disabledRows: ['I', 'N'] })).toEqual(['I', 'N']);
    expect(load({})).toEqual([]);
  });

  it.each(['B', 7, null, { B: true }, [1, 2], ['X', 'o']])('treats %j as no blacked-out rows', (rows) => {
    expect(load({ disabledRows: rows })).toEqual([]);
  });

  it('keeps only the real letters, once each, in order', () => {
    expect(load({ disabledRows: ['O', 'X', 'B', 'B', 4] })).toEqual(['B', 'O']);
  });
});

describe('parsePersistedState', () => {
  it('accepts a valid current document', () => {
    const result = parsePersistedState({
      schemaVersion: 4,
      savedAt: '2026-01-01T00:00:00.000Z',
      game: { calledNumbers: [3, 17, 9], bingoBannerVisible: true, disabledRows: [] },
      presentation: { mode: 'singleImage' },
      patterns: createDefaultPersistedState().patterns,
      media: createDefaultPersistedState().media,
      settings: { preferredDisplayId: 12 },
    });
    expect(result).toEqual({
      ok: true,
      warnings: [],
      state: {
        schemaVersion: 4,
        savedAt: '2026-01-01T00:00:00.000Z',
        game: { calledNumbers: [3, 17, 9], bingoBannerVisible: true, disabledRows: [] },
        presentation: { mode: 'singleImage' },
        patterns: createDefaultPersistedState().patterns,
        media: createDefaultPersistedState().media,
        timer: DEFAULT_TIMER,
        slideshow: EMPTY_SLIDESHOW,
        settings: { preferredDisplayId: 12, controllerTheme: 'light' },
      },
    });
  });

  describe('the Controller theme setting', () => {
    const withSettings = (settings: unknown) => ({
      ...createDefaultPersistedState(),
      settings,
    });
    const themeOf = (raw: unknown) => {
      const result = parsePersistedState(raw);
      if (!result.ok) throw new Error(result.error);
      return fromPersistedState(result.state).settings.controllerTheme;
    };

    it('is light for a new installation', () => {
      expect(fromPersistedState(createDefaultPersistedState()).settings.controllerTheme).toBe('light');
    });

    it('keeps a saved dark choice through save and load', () => {
      const data = fromPersistedState(createDefaultPersistedState());
      const saved = toPersistedState({ ...data, settings: { ...data.settings, controllerTheme: 'dark' } });
      expect(saved.settings.controllerTheme).toBe('dark');
      expect(themeOf(JSON.parse(JSON.stringify(saved)))).toBe('dark');
    });

    it('opens an existing file that has no theme in the light theme, keeping its other settings', () => {
      const raw = withSettings({ preferredDisplayId: 7 });
      expect(themeOf(raw)).toBe('light');
      const result = parsePersistedState(raw);
      expect(result.ok && result.state.settings.preferredDisplayId).toBe(7);
    });

    it('falls back to light for an unknown value instead of rejecting the file', () => {
      expect(themeOf(withSettings({ preferredDisplayId: null, controllerTheme: 'sepia' }))).toBe('light');
      expect(themeOf(withSettings({ preferredDisplayId: null, controllerTheme: 42 }))).toBe('light');
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
      schemaVersion: 4,
      savedAt: '2026-01-01T00:00:00.000Z',
      game: { calledNumbers: [], bingoBannerVisible: false, disabledRows: [] },
      presentation: { mode: 'gameBoard' },
      settings: { preferredDisplayId: null },
    });
    expect(state.patterns.library).toHaveLength(createDefaultLibrary().length);
    expect(state.patterns.active.sourcePatternId).toBeNull();
    expect(state.patterns.active.cells.some(Boolean)).toBe(false);
  });
});

describe('V4 save format (milestone 4: the media library)', () => {
  const ID_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const ID_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const COLLECTION_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const slideshow: SlideshowState = {
    activeId: COLLECTION_ID,
    collections: [
      {
        id: COLLECTION_ID,
        name: 'Sponsors',
        secondsPerSlide: 22,
        fit: 'fill',
        slides: [
          { mediaId: ID_B, fit: 'fit' },
          { mediaId: ID_A, fit: null },
        ],
      },
    ],
  };

  it('restores slideshow order, active collection and fit preferences from disk', async () => {
    const parsed = parsePersistedState(stateV4Fixture);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.state.slideshow).toEqual(EMPTY_SLIDESHOW);
    const dir = await mkdtemp(path.join(os.tmpdir(), 'bingo-slideshow-'));
    const data = fromPersistedState(parsed.state);
    const sample = data.media.library[0];
    if (!sample) throw new Error('The fixture needs an imported image.');
    const owned = { ...sample, id: COLLECTION_ID, name: 'Collection cover.png' };
    const withOwned: SlideshowState = {
      ...slideshow,
      showCountdown: false,
      collections: slideshow.collections.map((entry) => ({
        ...entry,
        slides: [...entry.slides, { mediaId: owned.id, fit: 'original', image: owned }],
      })),
    };
    try {
      await new JsonStateRepository(dir).save(toPersistedState({ ...data, slideshow: withOwned }));
      const loaded = await new JsonStateRepository(dir).load();
      expect(loaded.source).toBe('primary');
      expect(loaded.issues).toEqual([]);
      expect(fromPersistedState(loaded.state).slideshow).toEqual(withOwned);
      expect(fromPersistedState(loaded.state).media).toEqual(data.media);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('recovers damaged and dangling entries while preserving surviving slide order and game data', () => {
    const [collection] = slideshow.collections;
    const parsed = parsePersistedState({
      ...stateV4Fixture,
      slideshow: {
        activeId: 'missing',
        collections: [
          {
            ...collection,
            slides: [
              { mediaId: COLLECTION_ID, fit: 'fit' },
              { mediaId: ID_B, fit: 'fit' },
              { mediaId: ID_B, fit: 'fill' },
              { mediaId: ID_A, fit: null },
            ],
          },
          { ...collection, name: 'Duplicate' },
          { ...collection, id: 'bad-id' },
        ],
      },
    });
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.state.game).toEqual(stateV4Fixture.game);
    expect(parsed.state.slideshow).toEqual({ ...slideshow, activeId: null });
    expect(parsed.warnings).toHaveLength(2);
  });
  const image = (id: string, overrides: Record<string, unknown> = {}) => ({
    id,
    name: 'Logo.png',
    format: 'png',
    bytes: 100,
    width: 10,
    height: 10,
    addedAt: '2026-01-01T00:00:00.000Z',
    fit: 'fit' as const,
    ...overrides,
  });
  const load = (media: unknown) => {
    const result = parsePersistedState({
      ...stateV4Fixture,
      ...(media === undefined ? { media: undefined } : { media }),
    });
    if (!result.ok) throw new Error(result.error);
    return result;
  };

  it('loads the V4 fixture: two images, each with its own Fit or Fill, one chosen for Single Image', () => {
    const parsed = parsePersistedState(stateV4Fixture);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.warnings).toEqual([]);
    const { media, patterns } = fromPersistedState(parsed.state);
    expect(media.library.map((item) => [item.name, item.format, item.width, item.height])).toEqual([
      ['Legion Sponsors.png', 'png', 1200, 600],
      ['Menu.jpg', 'jpeg', 1920, 1080],
    ]);
    expect(media.library.map((item) => item.fit)).toEqual(['fit', 'fill']);
    expect(media.singleImage).toEqual({ imageId: ID_B });
    // Everything else in the file is unchanged by the media section.
    expect(patterns.active.title).toBe('Big L plus');
  });

  it('round-trips the early V4 fixture, adding the default countdown', () => {
    const parsed = parsePersistedState(stateV4Fixture);
    if (!parsed.ok) throw new Error(parsed.error);
    const written = toPersistedState(fromPersistedState(parsed.state));
    expect({ ...written, savedAt: stateV4Fixture.savedAt }).toEqual({
      ...stateV4Fixture,
      settings: { ...stateV4Fixture.settings, controllerTheme: 'light' },
      timer: DEFAULT_TIMER,
      slideshow: EMPTY_SLIDESHOW,
    });
  });

  it('loads the V4 fixture from disk through the repository', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'bingo-v4-'));
    try {
      const repo = new JsonStateRepository(dir);
      await copyFile(path.join(__dirname, 'fixtures', 'state-v4.json'), repo.filePath);
      const loaded = await repo.load();
      expect(loaded.source).toBe('primary');
      expect(loaded.issues).toEqual([]);
      const restored = fromPersistedState(loaded.state);
      expect(restored.media.library).toHaveLength(2);
      expect(restored.timer).toEqual({
        durationSeconds: 300,
        message: 'Next Game Begins In…',
        status: 'idle',
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('migrates a V3 file with no images and nothing chosen, without a warning', () => {
    const parsed = parsePersistedState(stateV3Fixture);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.warnings).toEqual([]);
    expect(parsed.state.media).toEqual({ library: [], singleImage: { imageId: null } });
  });

  describe('damaged image data never costs the game', () => {
    it('treats a missing media section as an empty library, silently', () => {
      const result = load(undefined);
      expect(result.state.media).toEqual({ library: [], singleImage: { imageId: null } });
      expect(result.warnings).toEqual([]);
    });

    it.each(['oops', 7, null, [], ['x']])(
      'clears an unreadable media section (%j), with a warning',
      (media) => {
        const result = load(media);
        expect(result.state.media.library).toEqual([]);
        expect(result.warnings.join(' ')).toMatch(/image library was damaged/);
        expect(result.state.game.calledNumbers).toEqual(stateV4Fixture.game.calledNumbers);
      },
    );

    it('drops only the damaged or duplicate entries, with a warning, and keeps the rest', () => {
      const result = load({
        library: [
          image(ID_A),
          image('not-a-uuid'),
          image(ID_B, { format: 'bmp' }),
          image(ID_B, { width: 0 }),
          image(ID_B, { name: '' }),
          'garbage',
          null,
          image(ID_A, { name: 'duplicate id' }),
          image('cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
        ],
        singleImage: { imageId: null },
      });
      expect(result.state.media.library.map((item) => item.id)).toEqual([
        ID_A,
        'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      ]);
      expect(result.warnings.join(' ')).toMatch(/Removed 7 damaged or duplicate saved image/);
      expect(result.state.patterns.library.length).toBeGreaterThan(0);
    });

    it('does not trust a stored file path: only the known fields survive', () => {
      const result = load({
        library: [{ ...image(ID_A), file: '../../Windows/win.ini', path: 'C:\\secret.png' }],
        singleImage: { imageId: ID_A },
      });
      expect(result.state.media.library[0]).toEqual(image(ID_A));
    });

    it('forgets a Single Image choice that no longer names a library image', () => {
      const result = load({ library: [image(ID_A)], singleImage: { imageId: ID_B } });
      expect(result.state.media.singleImage).toEqual({ imageId: null });
    });

    it.each(['fit', 'fill', 'original'])('keeps an image set to %s', (fit) => {
      const result = load({ library: [image(ID_A, { fit })], singleImage: { imageId: null } });
      expect(result.state.media.library[0]?.fit).toBe(fit);
    });

    it.each(['stretch', 'FILL', 1, null, undefined])(
      'falls back to Fit for an image whose setting is %j',
      (fit) => {
        const result = load({ library: [image(ID_A, { fit })], singleImage: { imageId: ID_A } });
        expect(result.state.media.library[0]?.fit).toBe('fit');
        expect(result.warnings).toEqual([]);
      },
    );

    describe('a file saved while Fit / Fill was one setting for the whole Single Image', () => {
      const without = (entry: Record<string, unknown>) => {
        const { fit: _ignored, ...rest } = entry;
        return rest;
      };

      it('gives the chosen image that setting, and leaves the others at Fit', () => {
        const result = load({
          library: [without(image(ID_A)), without(image(ID_B))],
          singleImage: { imageId: ID_B, fit: 'fill' },
        });
        expect(result.state.media.library.map((item) => [item.id, item.fit])).toEqual([
          [ID_A, 'fit'],
          [ID_B, 'fill'],
        ]);
        expect(result.state.media.singleImage).toEqual({ imageId: ID_B });
        expect(result.warnings).toEqual([]);
      });

      it('does not override an image that already has its own setting', () => {
        const result = load({
          library: [image(ID_A, { fit: 'original' })],
          singleImage: { imageId: ID_A, fit: 'fill' },
        });
        expect(result.state.media.library[0]?.fit).toBe('original');
      });

      it('ignores an unknown old setting', () => {
        const result = load({
          library: [without(image(ID_A))],
          singleImage: { imageId: ID_A, fit: 'stretch' },
        });
        expect(result.state.media.library[0]?.fit).toBe('fit');
      });
    });

    it.each(['x', 7, null, undefined])(
      'treats a Single Image section of %j as none chosen',
      (singleImage) => {
        const result = load({ library: [image(ID_A)], singleImage });
        expect(result.state.media.singleImage).toEqual({ imageId: null });
      },
    );
  });
});
