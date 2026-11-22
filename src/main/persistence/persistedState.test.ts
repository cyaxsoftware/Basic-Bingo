import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, expectTypeOf, it } from 'vitest';
import stateV1Fixture from './fixtures/state-v1.json';
import stateV2Fixture from './fixtures/state-v2.json';
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
} from './persistedState';
import { JsonStateRepository } from './stateRepository';

// A V1 file predates the banner, so it must come back with the banner hidden.
const V1_FIXTURE_APP_DATA: AppData = {
  game: { calledNumbers: [3, 17, 9, 31, 52, 75], bingoBannerVisible: false },
  presentation: { mode: 'gameBoard' },
  settings: { preferredDisplayId: 2779098405 },
};

const V2_FIXTURE_APP_DATA: AppData = {
  game: { calledNumbers: [3, 17, 9, 31, 52, 75], bingoBannerVisible: true },
  presentation: { mode: 'slideshow' },
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
  ])('migrates %s to V2 with the banner hidden and the board showing', (_name, game, expectedCalls) => {
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
        schemaVersion: 2,
        savedAt: '2026-01-01T00:00:00.000Z',
        game: { calledNumbers: expectedCalls, bingoBannerVisible: false },
        presentation: { mode: 'gameBoard' },
        settings: { preferredDisplayId: null },
      },
    });
  });

  it('still rejects a malformed V1 game section after migration', () => {
    expect(parsePersistedState({ schemaVersion: 1, game: 'oops' }).ok).toBe(false);
    expect(parsePersistedState({ schemaVersion: 1 }).ok).toBe(false);
    expect(parsePersistedState({ schemaVersion: 1, game: { calledNumbers: 'x' } }).ok).toBe(false);
  });
});

describe('V2 save format (milestone 2, unreleased)', () => {
  it('has the expected shape', () => {
    expectTypeOf<PersistedGameV2>().toEqualTypeOf<{
      readonly calledNumbers: readonly number[];
      readonly bingoBannerVisible: boolean;
    }>();
  });

  it('round-trips the V2 fixture, including a visible banner', () => {
    const parsed = parsePersistedState(stateV2Fixture);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.warnings).toEqual([]);
    expect(fromPersistedState(parsed.state)).toEqual(V2_FIXTURE_APP_DATA);
    // Writing it back produces the same document (apart from the save time).
    expect({ ...toPersistedState(V2_FIXTURE_APP_DATA), savedAt: stateV2Fixture.savedAt }).toEqual(
      stateV2Fixture,
    );
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

  it('writes the banner and calls, and nothing else from the game', () => {
    const grown = {
      game: { calledNumbers: [1, 2], bingoBannerVisible: true, somethingNew: 1 },
      presentation: { mode: 'countdown' },
      settings: { preferredDisplayId: null },
    } as AppData;
    expect(toPersistedState(grown, new Date('2026-01-01T00:00:00Z'))).toEqual({
      schemaVersion: 2,
      savedAt: '2026-01-01T00:00:00.000Z',
      game: { calledNumbers: [1, 2], bingoBannerVisible: true },
      presentation: { mode: 'countdown' },
      settings: { preferredDisplayId: null },
    });
  });

  it('round-trips app data through the current document', () => {
    for (const data of [V1_FIXTURE_APP_DATA, V2_FIXTURE_APP_DATA, createDefaultAppData()]) {
      expect(fromPersistedState(toPersistedState(data))).toEqual(data);
    }
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

describe('parsePersistedState', () => {
  it('accepts a valid current document', () => {
    const result = parsePersistedState({
      schemaVersion: 2,
      savedAt: '2026-01-01T00:00:00.000Z',
      game: { calledNumbers: [3, 17, 9], bingoBannerVisible: true },
      presentation: { mode: 'singleImage' },
      settings: { preferredDisplayId: 12 },
    });
    expect(result).toEqual({
      ok: true,
      warnings: [],
      state: {
        schemaVersion: 2,
        savedAt: '2026-01-01T00:00:00.000Z',
        game: { calledNumbers: [3, 17, 9], bingoBannerVisible: true },
        presentation: { mode: 'singleImage' },
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
    expect(parsePersistedState({ schemaVersion: 2 }).ok).toBe(false);
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

  it('creates an empty default state', () => {
    const state = createDefaultPersistedState(new Date('2026-01-01T00:00:00Z'));
    expect(state).toEqual({
      schemaVersion: 2,
      savedAt: '2026-01-01T00:00:00.000Z',
      game: { calledNumbers: [], bingoBannerVisible: false },
      presentation: { mode: 'gameBoard' },
      settings: { preferredDisplayId: null },
    });
  });
});
