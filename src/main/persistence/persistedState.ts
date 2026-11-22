/**
 * On-disk state format, migrations, and conversion to and from app data.
 *
 * Two kinds of type live here, and they must stay separate:
 *  - On-disk documents (PersistedStateV1, ...): frozen once released. A V1 file
 *    means exactly what PersistedStateV1 says, forever. They never reference
 *    live domain types such as GameState.
 *  - AppData: the durable state the running app works with. It grows freely.
 * `toPersistedState` / `fromPersistedState` convert between the current
 * document and AppData field by field, so adding a field to GameState cannot
 * silently change or leak into an existing file format.
 *
 * To change the format (e.g. M2 adds the BINGO banner to the game):
 *   1. Add PersistedStateV2 (with its own PersistedGameV2) and a zod schema.
 *      Point `PersistedState` at it and bump CURRENT_SCHEMA_VERSION.
 *   2. Add MIGRATIONS[1]: a V1 document -> a V2 document (fill new fields with defaults).
 *   3. Update toPersistedState / fromPersistedState. The compiler flags them
 *      when GameState gains a required field.
 *   4. Add a fixtures/state-v2.json and keep the state-v1.json test passing:
 *      old files must still load.
 * Never edit a released document type, schema, or migration.
 *
 * Only data that must survive a restart belongs here. Runtime state
 * (presentation window, displays, notices) is intentionally excluded.
 */
import { z } from 'zod';
import { normalizeCalledNumbers } from '../../shared/game/calledNumbers';
import type { GameState } from '../../shared/game/gameState';

export const CURRENT_SCHEMA_VERSION = 1;

// ---------------------------------------------------------------------------
// Version 1 document (released in milestone 1; frozen)
// ---------------------------------------------------------------------------

export interface PersistedGameV1 {
  /** Ordered, unique balls 1..75; last element is the current call. */
  readonly calledNumbers: readonly number[];
}

export interface PersistedStateV1 {
  readonly schemaVersion: 1;
  /** ISO timestamp of the save. Informational only. */
  readonly savedAt: string;
  readonly game: PersistedGameV1;
  readonly settings: {
    readonly preferredDisplayId: number | null;
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

// ---------------------------------------------------------------------------
// Current document and app data
// ---------------------------------------------------------------------------

/** The document version this build writes. */
export type PersistedState = PersistedStateV1;

/** Durable state as the running app uses it (independent of the file format). */
export interface AppData {
  readonly game: GameState;
  readonly settings: {
    readonly preferredDisplayId: number | null;
  };
}

export function createDefaultPersistedState(now: Date = new Date()): PersistedState {
  return {
    schemaVersion: 1,
    savedAt: now.toISOString(),
    game: { calledNumbers: [] },
    settings: { preferredDisplayId: null },
  };
}

/** App data for a brand-new installation. */
export function createDefaultAppData(): AppData {
  return fromPersistedState(createDefaultPersistedState());
}

/** Convert app data to the current on-disk document. Copies fields explicitly. */
export function toPersistedState(data: AppData, now: Date = new Date()): PersistedState {
  return {
    schemaVersion: 1,
    savedAt: now.toISOString(),
    game: { calledNumbers: [...data.game.calledNumbers] },
    settings: { preferredDisplayId: data.settings.preferredDisplayId },
  };
}

/** Convert a validated current document to app data. */
export function fromPersistedState(document: PersistedState): AppData {
  const game: GameState = { calledNumbers: [...document.game.calledNumbers] };
  return {
    game,
    settings: { preferredDisplayId: document.settings.preferredDisplayId },
  };
}

// ---------------------------------------------------------------------------
// Parsing and migration
// ---------------------------------------------------------------------------

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
