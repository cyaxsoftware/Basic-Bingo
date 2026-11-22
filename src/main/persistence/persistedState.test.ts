import { describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA_VERSION, createDefaultPersistedState, parsePersistedState } from './persistedState';

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
