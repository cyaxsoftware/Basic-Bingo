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
 * To change the format (this is how V3 added the pattern library):
 *   1. Add PersistedStateV3 (with its own game and pattern shapes) and a zod schema.
 *      Point `PersistedState` at it and bump CURRENT_SCHEMA_VERSION.
 *   2. Add MIGRATIONS[2]: a V2 document -> a V3 document (fill new fields with defaults).
 *   3. Update toPersistedState / fromPersistedState. The compiler flags them
 *      when AppData gains a required field.
 *   4. Add a fixtures/state-v3.json and keep the older fixture tests passing:
 *      old files must still load.
 * Never edit a released document type, schema, or migration.
 *
 * Only data that must survive a restart belongs here. Runtime state
 * (presentation window, displays, notices) is intentionally excluded.
 */
import { z } from 'zod';
import { normalizeCalledNumbers } from '../../shared/game/calledNumbers';
import type { GameState } from '../../shared/game/gameState';
import {
  blankActivePattern,
  createDefaultLibrary,
  isPatternCells,
  isValidPatternId,
  normalizeTitle,
  reconcileActive,
  SEED_TIMESTAMP,
  type ActivePattern,
  type Pattern,
  type PatternsState,
} from '../../shared/patterns';
import { DEFAULT_PRESENTATION_MODE, type PresentationMode } from '../../shared/presentation/presentationMode';

export const CURRENT_SCHEMA_VERSION = 3;

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

// There are no V1 or V2 schemas: an old file is migrated up to the current version first (see MIGRATIONS)
// and then validated by the current schema, which has the same leniency rules.

// ---------------------------------------------------------------------------
// Version 2 document (released in milestone 2; frozen)
// ---------------------------------------------------------------------------

export interface PersistedGameV2 {
  /** Ordered, unique balls 1..75; last element is the current call. */
  readonly calledNumbers: readonly number[];
  /** True while the "BINGO CALLED" banner is up. Survives a restart so it is never lost silently. */
  readonly bingoBannerVisible: boolean;
}

export interface PersistedPresentationV2 {
  /** Which view the audience display shows. Not part of the game. */
  readonly mode: 'gameBoard' | 'slideshow' | 'singleImage' | 'countdown';
}

export interface PersistedStateV2 {
  readonly schemaVersion: 2;
  /** ISO timestamp of the save. Informational only. */
  readonly savedAt: string;
  readonly game: PersistedGameV2;
  readonly presentation: PersistedPresentationV2;
  readonly settings: {
    readonly preferredDisplayId: number | null;
  };
}

// ---------------------------------------------------------------------------
// Version 3 document (milestone 3; UNRELEASED, so later M3 cards may still extend it.
// Freeze it, like V1 and V2, when M3 ships.)
// ---------------------------------------------------------------------------

export interface PersistedGameV3 {
  /** Ordered, unique balls 1..75; last element is the current call. */
  readonly calledNumbers: readonly number[];
  readonly bingoBannerVisible: boolean;
}

export interface PersistedPresentationV3 {
  readonly mode: 'gameBoard' | 'slideshow' | 'singleImage' | 'countdown';
}

/** A saved library pattern: 25 explicit booleans, row-major, no free-space rule. */
export interface PersistedPatternV3 {
  readonly id: string;
  readonly title: string;
  readonly cells: readonly boolean[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** The working copy the game is showing. */
export interface PersistedActivePatternV3 {
  /** The library pattern it was copied from, or null for a one-off. */
  readonly sourcePatternId: string | null;
  readonly title: string;
  readonly cells: readonly boolean[];
  readonly editedFromLibrary: boolean;
}

/** What the projector shows: the working pattern as it was when the operator pushed it. */
export interface PersistedShownPatternV3 {
  readonly title: string;
  readonly cells: readonly boolean[];
}

export interface PersistedStateV3 {
  readonly schemaVersion: 3;
  /** ISO timestamp of the save. Informational only. */
  readonly savedAt: string;
  readonly game: PersistedGameV3;
  readonly presentation: PersistedPresentationV3;
  readonly patterns: {
    readonly library: readonly PersistedPatternV3[];
    readonly active: PersistedActivePatternV3;
    /** Null when nothing is pushed to the projector. Added during M3, while V3 was unreleased. */
    readonly shown: PersistedShownPatternV3 | null;
  };
  readonly settings: {
    readonly preferredDisplayId: number | null;
  };
}

// Lenient where safe (bad optional fields fall back to defaults), strict where
// it matters (unknown version, missing game section). calledNumbers is
// normalized rather than rejected so one bad entry cannot discard a game.
// `patterns` is checked entry by entry in normalizePatterns, so one damaged
// pattern cannot cost the game, or the rest of the library.
const PersistedStateV3Schema = z.object({
  schemaVersion: z.literal(3),
  savedAt: z.string().catch(''),
  game: z.object({
    calledNumbers: z.array(z.unknown()),
    bingoBannerVisible: z.boolean().catch(false),
  }),
  // An unknown mode (e.g. from a hand-edited file) falls back to the board rather than losing the game.
  presentation: z
    .object({
      mode: z.enum(['gameBoard', 'slideshow', 'singleImage', 'countdown']).catch('gameBoard'),
    })
    .catch({ mode: 'gameBoard' }),
  patterns: z.unknown(),
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
export type PersistedState = PersistedStateV3;

/** Durable state as the running app uses it (independent of the file format). */
export interface AppData {
  readonly game: GameState;
  readonly presentation: { readonly mode: PresentationMode };
  /** The pattern library and the working copy the game is showing. */
  readonly patterns: PatternsState;
  readonly settings: {
    readonly preferredDisplayId: number | null;
  };
}

/** The default library and an empty working pattern, as plain on-disk data. */
function defaultPersistedPatterns(): PersistedStateV3['patterns'] {
  return toPersistedPatterns({ library: createDefaultLibrary(), active: blankActivePattern(), shown: null });
}

function toPersistedPatterns(patterns: PatternsState): PersistedStateV3['patterns'] {
  return {
    library: patterns.library.map((pattern) => ({
      id: pattern.id,
      title: pattern.title,
      cells: [...pattern.cells],
      createdAt: pattern.createdAt,
      updatedAt: pattern.updatedAt,
    })),
    active: {
      sourcePatternId: patterns.active.sourcePatternId,
      title: patterns.active.title,
      cells: [...patterns.active.cells],
      editedFromLibrary: patterns.active.editedFromLibrary,
    },
    shown: patterns.shown ? { title: patterns.shown.title, cells: [...patterns.shown.cells] } : null,
  };
}

export function createDefaultPersistedState(now: Date = new Date()): PersistedState {
  return {
    schemaVersion: 3,
    savedAt: now.toISOString(),
    game: { calledNumbers: [], bingoBannerVisible: false },
    presentation: { mode: DEFAULT_PRESENTATION_MODE },
    patterns: defaultPersistedPatterns(),
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
    schemaVersion: 3,
    savedAt: now.toISOString(),
    game: {
      calledNumbers: [...data.game.calledNumbers],
      bingoBannerVisible: data.game.bingoBannerVisible,
    },
    presentation: { mode: data.presentation.mode },
    patterns: toPersistedPatterns(data.patterns),
    settings: { preferredDisplayId: data.settings.preferredDisplayId },
  };
}

/** Convert a validated current document to app data. */
export function fromPersistedState(document: PersistedState): AppData {
  const game: GameState = {
    calledNumbers: [...document.game.calledNumbers],
    bingoBannerVisible: document.game.bingoBannerVisible,
  };
  const library: readonly Pattern[] = document.patterns.library.map((pattern) => ({
    ...pattern,
    cells: [...pattern.cells],
  }));
  const active: ActivePattern = { ...document.patterns.active, cells: [...document.patterns.active.cells] };
  const { shown } = document.patterns;
  return {
    game,
    presentation: { mode: document.presentation.mode },
    patterns: { library, active, shown: shown ? { title: shown.title, cells: [...shown.cells] } : null },
    settings: { preferredDisplayId: document.settings.preferredDisplayId },
  };
}

// ---------------------------------------------------------------------------
// Parsing and migration
// ---------------------------------------------------------------------------

/**
 * Migrations keyed by the version they upgrade FROM. They run on raw JSON, before
 * schema validation, so they must tolerate malformed input and leave it for the
 * schema to reject.
 */
const MIGRATIONS: Record<number, (raw: Record<string, unknown>) => Record<string, unknown>> = {
  // V1 -> V2: the banner and the presentation mode did not exist, so they start hidden / on the board.
  1: (raw) => {
    const game = raw['game'];
    const presentation = { mode: 'gameBoard' };
    if (typeof game !== 'object' || game === null || Array.isArray(game)) {
      return { ...raw, schemaVersion: 2, presentation };
    }
    return { ...raw, schemaVersion: 2, game: { ...game, bingoBannerVisible: false }, presentation };
  },
  // V2 -> V3: patterns did not exist, so a migrated game starts with the default library and an empty
  // working pattern. (These are what a fresh install gets; changing the seeds later only affects files
  // migrated after that.)
  2: (raw) => ({ ...raw, schemaVersion: 3, patterns: defaultPersistedPatterns() }),
};

export type ParseResult =
  | { readonly ok: true; readonly state: PersistedState; readonly warnings: readonly string[] }
  | { readonly ok: false; readonly error: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function validPattern(entry: unknown): PersistedPatternV3 | null {
  if (!isRecord(entry)) return null;
  const { id, title, cells, createdAt, updatedAt } = entry;
  if (!isValidPatternId(id) || !isPatternCells(cells)) return null;
  let cleanTitle: string;
  try {
    cleanTitle = normalizeTitle(title);
  } catch {
    return null;
  }
  return {
    id,
    title: cleanTitle,
    cells: [...cells],
    createdAt: typeof createdAt === 'string' ? createdAt : SEED_TIMESTAMP,
    updatedAt: typeof updatedAt === 'string' ? updatedAt : SEED_TIMESTAMP,
  };
}

function validActive(entry: unknown): ActivePattern | null {
  if (!isRecord(entry)) return null;
  const { sourcePatternId, title, cells } = entry;
  if (!isPatternCells(cells)) return null;
  let cleanTitle: string;
  try {
    cleanTitle = normalizeTitle(title);
  } catch {
    return null;
  }
  // "Edited" is recomputed from the library afterwards, never trusted from the file.
  return {
    sourcePatternId: isValidPatternId(sourcePatternId) ? sourcePatternId : null,
    title: cleanTitle,
    cells: [...cells],
    editedFromLibrary: false,
  };
}

/** The pushed pattern, or null when there is none (or it is damaged: the audience then sees no pattern). */
function validShown(entry: unknown): PersistedShownPatternV3 | null {
  if (!isRecord(entry)) return null;
  const { title, cells } = entry;
  if (!isPatternCells(cells)) return null;
  try {
    return { title: normalizeTitle(title), cells: [...cells] };
  } catch {
    return null;
  }
}

/**
 * Check the pattern section entry by entry. One damaged pattern is dropped (with a warning), never the whole
 * library or the game. The library and the working copy are recovered independently: an unreadable library
 * restores the defaults but still keeps a valid working copy (the operator's edits), and a damaged working
 * copy resets only itself. A deliberately empty library is respected.
 */
function normalizePatterns(raw: unknown): { patterns: PersistedStateV3['patterns']; warnings: string[] } {
  if (!isRecord(raw)) {
    return {
      patterns: defaultPersistedPatterns(),
      warnings: ['The saved patterns were missing or damaged, so the default patterns were restored.'],
    };
  }
  const warnings: string[] = [];
  let library: Pattern[];
  if (Array.isArray(raw['library'])) {
    library = [];
    const seen = new Set<string>();
    let dropped = 0;
    for (const entry of raw['library']) {
      const pattern = validPattern(entry);
      if (!pattern || seen.has(pattern.id)) {
        dropped += 1;
        continue;
      }
      seen.add(pattern.id);
      library.push(pattern);
    }
    if (dropped > 0) warnings.push(`Removed ${dropped} damaged or duplicate saved pattern(s).`);
  } else {
    library = [...createDefaultLibrary()];
    warnings.push('The saved pattern library was missing or damaged, so the default patterns were restored.');
  }

  let active = validActive(raw['active']);
  if (!active) {
    warnings.push('The active pattern was missing or damaged, so it was reset.');
    active = blankActivePattern();
  }
  // A missing pushed pattern is normal (nothing is shown); one that is present but unreadable is reported.
  const shown = validShown(raw['shown']);
  if (shown === null && raw['shown'] !== undefined && raw['shown'] !== null) {
    warnings.push('The pattern shown on the projector was damaged, so it was cleared.');
  }
  // Re-derive "Edited", and detach the working copy if its template is gone.
  return {
    patterns: toPersistedPatterns({ library, active: reconcileActive(active, library), shown }),
    warnings,
  };
}

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

  const parsed = PersistedStateV3Schema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, error: `State file is malformed: ${z.prettifyError(parsed.error)}` };
  }

  const warnings: string[] = [];
  const rawCalls = parsed.data.game.calledNumbers;
  const calledNumbers = normalizeCalledNumbers(rawCalls);
  if (calledNumbers.length !== rawCalls.length) {
    warnings.push(`Removed ${rawCalls.length - calledNumbers.length} invalid or duplicate called number(s).`);
  }
  const { patterns, warnings: patternWarnings } = normalizePatterns(parsed.data.patterns);
  warnings.push(...patternWarnings);

  return {
    ok: true,
    warnings,
    state: {
      schemaVersion: 3,
      savedAt: parsed.data.savedAt,
      game: { calledNumbers, bingoBannerVisible: parsed.data.game.bingoBannerVisible },
      presentation: { mode: parsed.data.presentation.mode },
      patterns,
      settings: { preferredDisplayId: parsed.data.settings.preferredDisplayId },
    },
  };
}
