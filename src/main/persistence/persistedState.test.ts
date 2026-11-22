import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, expectTypeOf, it } from 'vitest';
import stateV1Fixture from './fixtures/state-v1.json';
import {
  CURRENT_SCHEMA_VERSION,
  createDefaultAppData,
  createDefaultPersistedState,
  fromPersistedState,
  parsePersistedState,
  toPersistedState,
  type AppData,
  type PersistedGameV1,
  type PersistedStateV1,
} from './persistedState';
import { JsonStateRepository } from './stateRepository';

const V1_FIXTURE_APP_DATA: AppData = {
  game: { calledNumbers: [3, 17, 9, 31, 52, 75] },
  settings: { preferredDisplayId: 2779098405 },
};

describe('V1 save format is frozen (audit finding 5, #22)', () => {
  it('keeps its own game shape, independent of the live GameState', () => {
    // Type-level guard (checked by `npm run typecheck`): editing GameState must not change V1.
    expectTypeOf<PersistedGameV1>().toEqualTypeOf<{ readonly calledNumbers: readonly number[] }>();
    expectTypeOf<PersistedStateV1['game']>().toEqualTypeOf<PersistedGameV1>();
  });

  it('loads the representative V1 fixture into the current app data', () => {
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

  it('writes only V1 fields, even if app data carries more', () => {
    const grown = {
      game: { calledNumbers: [1, 2], bingoBannerVisible: true },
      settings: { preferredDisplayId: null },
    } as AppData;
    const document = toPersistedState(grown, new Date('2026-01-01T00:00:00Z'));
    expect(document).toEqual({
      schemaVersion: 1,
      savedAt: '2026-01-01T00:00:00.000Z',
      game: { calledNumbers: [1, 2] },
      settings: { preferredDisplayId: null },
    });
  });

  it('round-trips app data through the current document', () => {
    expect(fromPersistedState(toPersistedState(V1_FIXTURE_APP_DATA))).toEqual(V1_FIXTURE_APP_DATA);
    expect(fromPersistedState(toPersistedState(createDefaultAppData()))).toEqual(createDefaultAppData());
  });
});

describe('parsePersistedState', () => {
  it('accepts a valid v1 document', () => {
    const result = parsePersistedState({
      schemaVersion: 1,
      savedAt: '2026-01-01T00:00:00.000Z',
      game: { calledNumbers: [3, 17, 9] },
      settings: { preferredDisplayId: 12 },
    });
    expect(result).toEqual({
      ok: true,
      warnings: [],
      state: {
        schemaVersion: 1,
        savedAt: '2026-01-01T00:00:00.000Z',
        game: { calledNumbers: [3, 17, 9] },
        settings: { preferredDisplayId: 12 },
      },
    });
  });

  it('defaults a missing or invalid settings section', () => {
    const result = parsePersistedState({ schemaVersion: 1, game: { calledNumbers: [] }, settings: 'x' });
    expect(result.ok && result.state.settings.preferredDisplayId).toBeNull();
  });

  it.each([null, [], 'text', 42])('rejects non-object input %j', (raw) => {
    expect(parsePersistedState(raw).ok).toBe(false);
  });

  it('rejects a missing game section', () => {
    expect(parsePersistedState({ schemaVersion: 1 }).ok).toBe(false);
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
      schemaVersion: 1,
      savedAt: '2026-01-01T00:00:00.000Z',
      game: { calledNumbers: [] },
      settings: { preferredDisplayId: null },
    });
  });
});
