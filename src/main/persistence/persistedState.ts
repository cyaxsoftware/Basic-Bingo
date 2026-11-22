/**
 * On-disk state format and migrations.
 *
 * The file is versioned by `schemaVersion`. To change the format:
 *   1. Define the new shape and bump CURRENT_SCHEMA_VERSION.
 *   2. Add a migration from the previous version to MIGRATIONS.
 *   3. Add tests in persistedState.test.ts that load a fixture of the old version.
 * Never edit an existing migration after release.
 *
 * Only data that must survive a restart belongs here. Runtime state
 * (presentation window, displays, notices) is intentionally excluded.
 */
import { z } from 'zod';
import { normalizeCalledNumbers } from '../../shared/game/calledNumbers';
import { INITIAL_GAME_STATE, type GameState } from '../../shared/game/gameState';

export const CURRENT_SCHEMA_VERSION = 1;

export interface PersistedStateV1 {
  readonly schemaVersion: 1;
  /** ISO timestamp of the save. Informational only. */
  readonly savedAt: string;
  readonly game: GameState;
  readonly settings: {
    readonly preferredDisplayId: number | null;
  };
}

export type PersistedState = PersistedStateV1;

export function createDefaultPersistedState(now: Date = new Date()): PersistedState {
  return {
    schemaVersion: 1,
    savedAt: now.toISOString(),
    game: INITIAL_GAME_STATE,
    settings: { preferredDisplayId: null },
  };
}

// Lenient where safe (bad optional fields fall back to defaults), strict where
// it matters (unknown version, missing game section). calledNumbers is
// normalized rather than rejected so one bad entry cannot discard a game.
const PersistedStateV1Schema = z.object({
  schemaVersion: z.literal(1),
  savedAt: z.string().catch(''),
  game: z.object({
    calledNumbers: z.array(z.unknown()),
  }),
  settings: z
    .object({
      preferredDisplayId: z.number().int().nullable().catch(null),
    })
    .catch({ preferredDisplayId: null }),
});

/** Migrations keyed by the version they upgrade FROM. Empty until v2 exists. */
const MIGRATIONS: Record<number, (raw: Record<string, unknown>) => Record<string, unknown>> = {};

export type ParseResult =
  | { readonly ok: true; readonly state: PersistedState; readonly warnings: readonly string[] }
  | { readonly ok: false; readonly error: string };

/** Validate and migrate parsed JSON into the current {@link PersistedState}. */
export function parsePersistedState(raw: unknown): ParseResult {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, error: 'State file does not contain a JSON object.' };
  }
  let data = raw as Record<string, unknown>;
  let version = data['schemaVersion'];
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return { ok: false, error: `State file has an invalid schemaVersion (${String(version)}).` };
  }
  if (version > CURRENT_SCHEMA_VERSION) {
    return {
      ok: false,
      error: `State file was written by a newer version of the app (schema ${version}; this app supports ${CURRENT_SCHEMA_VERSION}).`,
    };
  }
  while (version < CURRENT_SCHEMA_VERSION) {
    const migrate = MIGRATIONS[version];
    if (!migrate) return { ok: false, error: `No migration from schema version ${version}.` };
    data = migrate(data);
    version += 1;
  }

  const parsed = PersistedStateV1Schema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, error: `State file is malformed: ${z.prettifyError(parsed.error)}` };
  }

  const warnings: string[] = [];
  const rawCalls = parsed.data.game.calledNumbers;
  const calledNumbers = normalizeCalledNumbers(rawCalls);
  if (calledNumbers.length !== rawCalls.length) {
    warnings.push(`Removed ${rawCalls.length - calledNumbers.length} invalid or duplicate called number(s).`);
  }

  return {
    ok: true,
    warnings,
    state: {
      schemaVersion: 1,
      savedAt: parsed.data.savedAt,
      game: { calledNumbers },
      settings: { preferredDisplayId: parsed.data.settings.preferredDisplayId },
    },
  };
}
