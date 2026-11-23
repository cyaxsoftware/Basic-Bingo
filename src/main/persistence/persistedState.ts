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
 * To change the format (this is how V4 added the media library):
 *   1. Add PersistedStateV4 (with its own new shapes) and a zod schema.
 *      Point `PersistedState` at it and bump CURRENT_SCHEMA_VERSION.
 *   2. Add MIGRATIONS[3]: a V3 document -> a V4 document (fill new fields with defaults).
 *   3. Update toPersistedState / fromPersistedState. The compiler flags them
 *      when AppData gains a required field.
 *   4. Add a fixtures/state-v4.json and keep the older fixture tests passing:
 *      old files must still load.
 * Never edit a released document type, schema, or migration.
 *
 * Only data that must survive a restart belongs here. Runtime state
 * (presentation window, displays, notices) is intentionally excluded.
 */
import { z } from 'zod';
import type { BingoLetter } from '../../shared/game/balls';
import { normalizeCalledNumbers } from '../../shared/game/calledNumbers';
import { normalizeDisabledRows, type GameState } from '../../shared/game/gameState';
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
import { isFitMode, isMediaItem, type FitMode, type ImageFormat, type MediaState } from '../../shared/media';
import { isValidMediaId } from '../../shared/media/media';
import {
  collectionName,
  EMPTY_SLIDESHOW,
  slideshowFit,
  slideFit,
  slideSeconds,
  type SlideshowState,
} from '../../shared/media/slideshow';
import { DEFAULT_PRESENTATION_MODE, type PresentationMode } from '../../shared/presentation/presentationMode';
import { DEFAULT_CONTROLLER_THEME, type ControllerTheme } from '../../shared/theme/controllerTheme';
import { EMPTY_GAME_LOG, normalizeGameLog, type GameLogState } from '../../shared/games/gameLog';
import {
  DEFAULT_TIMER,
  isCountdownMessage,
  isTimerDuration,
  reduceTimer,
  type TimerState,
} from '../../shared/timer/timerState';

export const CURRENT_SCHEMA_VERSION = 4;

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
// Version 3 document (released in milestone 3; frozen)
// ---------------------------------------------------------------------------

export interface PersistedGameV3 {
  /** Ordered, unique balls 1..75; last element is the current call. */
  readonly calledNumbers: readonly number[];
  readonly bingoBannerVisible: boolean;
  /** Rows blacked out for this game. Added during M3, while V3 was unreleased; a missing field means none. */
  readonly disabledRows: readonly BingoLetter[];
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

// ---------------------------------------------------------------------------
// Version 4 document (milestone 4: media and countdown).
// ---------------------------------------------------------------------------

/** One imported image. The file's name is derived from `id` and `format`, never stored. */
export interface PersistedMediaItemV4 {
  readonly id: string;
  readonly name: string;
  readonly format: ImageFormat;
  readonly bytes: number;
  readonly width: number;
  readonly height: number;
  readonly addedAt: string;
  /** How this image meets the screen. Each image has its own. */
  readonly fit: FitMode;
}

export interface PersistedMediaV4 {
  readonly library: readonly PersistedMediaItemV4[];
  /** What the Single Image mode shows: a library image, or none. */
  readonly singleImage: {
    readonly imageId: string | null;
  };
}

export interface PersistedStateV4 extends Omit<PersistedStateV3, 'schemaVersion' | 'settings'> {
  readonly schemaVersion: 4;
  /** `controllerTheme` was added while V4 was still open: a file without it loads as the light theme. */
  readonly settings: {
    readonly preferredDisplayId: number | null;
    readonly controllerTheme: ControllerTheme;
  };
  readonly media: PersistedMediaV4;
  readonly timer: PersistedTimerV4;
  readonly slideshow: PersistedSlideshowV4;
  /** Added while V4 was still open: a file without it has no games logged yet. */
  readonly gameLog: PersistedGameLogV4;
}

interface PersistedGameLogV4 {
  readonly records: readonly {
    readonly id: string;
    readonly number: number;
    readonly startedAt: number;
    readonly title: string;
    readonly durationSeconds: number;
  }[];
  readonly current: {
    readonly firstBallAt: number | null;
    readonly lastBingoAt: number | null;
    readonly resumedAt: number | null;
    readonly pausedMs: number;
    readonly bingoTitle: string | null;
  };
}

interface PersistedSlideshowV4 {
  readonly activeId: string | null;
  readonly showCountdown?: boolean;
  readonly collections: readonly {
    readonly id: string;
    readonly name: string;
    readonly secondsPerSlide: number;
    readonly fit: 'fit' | 'fill';
    readonly slides: readonly {
      readonly mediaId: string;
      readonly fit: 'original' | 'fit' | 'fill' | null;
      readonly image?: PersistedMediaItemV4;
    }[];
  }[];
}

type PersistedTimerV4 = {
  readonly durationSeconds: number;
  readonly message: string;
} & (
  | { readonly status: 'idle' | 'expired' }
  | { readonly status: 'running'; readonly targetAt: number }
  | { readonly status: 'paused'; readonly remainingMs: number }
);

// Lenient where safe (bad optional fields fall back to defaults), strict where
// it matters (unknown version, missing game section). calledNumbers is
// normalized rather than rejected so one bad entry cannot discard a game.
// `patterns` is checked entry by entry in normalizePatterns, so one damaged
// pattern cannot cost the game, or the rest of the library.
const PersistedStateV4Schema = z.object({
  schemaVersion: z.literal(4),
  savedAt: z.string().catch(''),
  game: z.object({
    calledNumbers: z.array(z.unknown()),
    bingoBannerVisible: z.boolean().catch(false),
    // Checked letter by letter in normalizeDisabledRows; anything else just means no row is blacked out.
    disabledRows: z.unknown().catch([]),
  }),
  // An unknown mode (e.g. from a hand-edited file) falls back to the board rather than losing the game.
  presentation: z
    .object({
      mode: z.enum(['gameBoard', 'slideshow', 'singleImage', 'countdown']).catch('gameBoard'),
    })
    .catch({ mode: 'gameBoard' }),
  patterns: z.unknown(),
  // Checked entry by entry in normalizeMedia, so one damaged image cannot cost the game or the rest of the library.
  media: z.unknown(),
  timer: z.unknown().optional(),
  slideshow: z.unknown().optional(),
  // Checked entry by entry in normalizeSavedGameLog, so one damaged entry cannot cost the rest of the history.
  gameLog: z.unknown().optional(),
  settings: z
    .object({
      preferredDisplayId: z.number().int().nullable().catch(null),
      // Anything but light or dark (a hand-edited file, or a file from before the switch existed) means light.
      controllerTheme: z.enum(['light', 'dark']).catch(DEFAULT_CONTROLLER_THEME),
    })
    .catch({ preferredDisplayId: null, controllerTheme: DEFAULT_CONTROLLER_THEME }),
});

// ---------------------------------------------------------------------------
// Current document and app data
// ---------------------------------------------------------------------------

/** The document version this build writes. */
export type PersistedState = PersistedStateV4;

/** Durable state as the running app uses it (independent of the file format). */
export interface AppData {
  readonly game: GameState;
  readonly presentation: { readonly mode: PresentationMode };
  /** The pattern library and the working copy the game is showing. */
  readonly patterns: PatternsState;
  /** The imported images and the Single Image choice. */
  readonly media: MediaState;
  readonly timer: TimerState;
  readonly slideshow: SlideshowState;
  /** The games played so far, and the clock of the game in progress. */
  readonly gameLog: GameLogState;
  readonly settings: {
    readonly preferredDisplayId: number | null;
    readonly controllerTheme: ControllerTheme;
  };
}

/** The default library and an empty working pattern, as plain on-disk data. */
function defaultPersistedPatterns(): PersistedStateV3['patterns'] {
  return toPersistedPatterns({ library: createDefaultLibrary(), active: blankActivePattern(), shown: null });
}

function defaultPersistedMedia(): PersistedMediaV4 {
  return { library: [], singleImage: { imageId: null } };
}

function toPersistedGameLog(log: GameLogState): PersistedGameLogV4 {
  return {
    records: log.records.map((record) => ({ ...record })),
    current: { ...log.current },
  };
}

function toPersistedSlideshow(state: SlideshowState): PersistedSlideshowV4 {
  return {
    activeId: state.activeId,
    ...(state.showCountdown === undefined ? {} : { showCountdown: state.showCountdown }),
    collections: state.collections.map(({ id, name, secondsPerSlide, fit, slides }) => ({
      id,
      name,
      secondsPerSlide,
      fit,
      slides: slides.map(({ mediaId, fit: override, image }) => ({
        mediaId,
        fit: override,
        ...(image ? { image: toPersistedMediaItem(image) } : {}),
      })),
    })),
  };
}

function toPersistedTimer(timer: TimerState): PersistedTimerV4 {
  const { durationSeconds, message, status } = timer;
  const settings = { durationSeconds, message };
  switch (status) {
    case 'running':
      return { ...settings, status, targetAt: timer.targetAt };
    case 'paused':
      return { ...settings, status, remainingMs: timer.remainingMs };
    default:
      return { ...settings, status };
  }
}

function toPersistedMediaItem(item: PersistedMediaItemV4): PersistedMediaItemV4 {
  return {
    id: item.id,
    name: item.name,
    format: item.format,
    bytes: item.bytes,
    width: item.width,
    height: item.height,
    addedAt: item.addedAt,
    fit: item.fit,
  };
}

function toPersistedMedia(media: MediaState): PersistedMediaV4 {
  return {
    library: media.library.map(toPersistedMediaItem),
    singleImage: { imageId: media.singleImage.imageId },
  };
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
    schemaVersion: 4,
    savedAt: now.toISOString(),
    game: { calledNumbers: [], bingoBannerVisible: false, disabledRows: [] },
    presentation: { mode: DEFAULT_PRESENTATION_MODE },
    patterns: defaultPersistedPatterns(),
    media: defaultPersistedMedia(),
    timer: toPersistedTimer(DEFAULT_TIMER),
    slideshow: toPersistedSlideshow(EMPTY_SLIDESHOW),
    gameLog: toPersistedGameLog(EMPTY_GAME_LOG),
    settings: { preferredDisplayId: null, controllerTheme: DEFAULT_CONTROLLER_THEME },
  };
}

/** App data for a brand-new installation. */
export function createDefaultAppData(): AppData {
  return fromPersistedState(createDefaultPersistedState());
}

/** Convert app data to the current on-disk document. Copies fields explicitly. */
export function toPersistedState(data: AppData, now: Date = new Date()): PersistedState {
  return {
    schemaVersion: 4,
    savedAt: now.toISOString(),
    game: {
      calledNumbers: [...data.game.calledNumbers],
      bingoBannerVisible: data.game.bingoBannerVisible,
      disabledRows: [...data.game.disabledRows],
    },
    presentation: { mode: data.presentation.mode },
    patterns: toPersistedPatterns(data.patterns),
    media: toPersistedMedia(data.media),
    timer: toPersistedTimer(data.timer),
    slideshow: toPersistedSlideshow(data.slideshow),
    gameLog: toPersistedGameLog(data.gameLog),
    settings: {
      preferredDisplayId: data.settings.preferredDisplayId,
      controllerTheme: data.settings.controllerTheme,
    },
  };
}

/** Convert a validated current document to app data. */
export function fromPersistedState(document: PersistedState, now: Date = new Date()): AppData {
  const game: GameState = {
    calledNumbers: [...document.game.calledNumbers],
    bingoBannerVisible: document.game.bingoBannerVisible,
    disabledRows: [...document.game.disabledRows],
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
    media: {
      library: document.media.library.map((item) => ({ ...item })),
      singleImage: { ...document.media.singleImage },
    },
    timer: reduceTimer({ ...document.timer }, { type: 'expire' }, now.getTime()),
    slideshow: toPersistedSlideshow(document.slideshow),
    gameLog: toPersistedGameLog(document.gameLog),
    settings: {
      preferredDisplayId: document.settings.preferredDisplayId,
      controllerTheme: document.settings.controllerTheme,
    },
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
  // V3 -> V4: the media library and timer start with their defaults.
  3: (raw) => ({
    ...raw,
    schemaVersion: 4,
    media: defaultPersistedMedia(),
    timer: undefined,
    slideshow: undefined,
    gameLog: undefined,
  }),
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

/**
 * Check the media section entry by entry. A damaged image entry is dropped (with a warning), never the whole library
 * or the game; a Single Image choice that no longer names a library image (or an unknown Fit mode) falls back to
 * "none" / Fit. Whether the FILES exist is checked at startup by the media service, not here.
 */
function normalizeMedia(raw: unknown): { media: PersistedMediaV4; warnings: string[] } {
  if (!isRecord(raw)) {
    return {
      media: defaultPersistedMedia(),
      warnings: raw === undefined ? [] : ['The saved image library was damaged, so it was cleared.'],
    };
  }
  const warnings: string[] = [];
  const single = isRecord(raw['singleImage']) ? raw['singleImage'] : {};
  // Early M4 builds kept ONE Fit / Fill choice for the Single Image; it becomes the chosen image's own setting.
  const legacyFit = isFitMode(single['fit']) ? single['fit'] : 'fit';
  const legacyImageId = single['imageId'];

  const library: PersistedMediaItemV4[] = [];
  const seen = new Set<string>();
  let dropped = 0;
  if (Array.isArray(raw['library'])) {
    for (const entry of raw['library']) {
      const candidate = isRecord(entry)
        ? {
            ...entry,
            fit: isFitMode(entry['fit']) ? entry['fit'] : entry['id'] === legacyImageId ? legacyFit : 'fit',
          }
        : entry;
      if (!isMediaItem(candidate) || seen.has(candidate.id)) {
        dropped += 1;
        continue;
      }
      seen.add(candidate.id);
      library.push({
        id: candidate.id,
        name: candidate.name,
        format: candidate.format,
        bytes: candidate.bytes,
        width: candidate.width,
        height: candidate.height,
        addedAt: candidate.addedAt,
        fit: candidate.fit,
      });
    }
  } else if (raw['library'] !== undefined) {
    warnings.push('The saved image library was damaged, so it was cleared.');
  }
  if (dropped > 0) warnings.push(`Removed ${dropped} damaged or duplicate saved image(s).`);

  const imageId = typeof legacyImageId === 'string' && seen.has(legacyImageId) ? legacyImageId : null;
  return { media: { library, singleImage: { imageId } }, warnings };
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

const savedCollection = z.object({
  id: z.string().refine(isValidMediaId),
  name: collectionName,
  secondsPerSlide: slideSeconds,
  fit: slideshowFit,
  slides: z.array(z.unknown()),
});
const savedSlide = z.object({ mediaId: z.string(), fit: slideFit, image: z.unknown().optional() });

function normalizeSlideshow(
  raw: unknown,
  library: PersistedMediaV4['library'],
  warnings: string[],
): PersistedSlideshowV4 {
  if (raw === undefined) return toPersistedSlideshow(EMPTY_SLIDESHOW);
  if (!isRecord(raw) || !Array.isArray(raw['collections'])) {
    warnings.push('Saved slideshow collections were damaged and cleared.');
    return toPersistedSlideshow(EMPTY_SLIDESHOW);
  }

  const collections: PersistedSlideshowV4['collections'][number][] = [];
  const libraryIds = new Set(library.map((image) => image.id));
  const ownedIds = new Set<string>();
  const ids = new Set<string>();
  let damaged = 0;
  for (const entry of raw['collections']) {
    const parsed = savedCollection.safeParse(entry);
    if (!parsed.success || ids.has(parsed.data.id)) {
      damaged += 1;
      continue;
    }
    ids.add(parsed.data.id);
    const slideIds = new Set<string>();
    const slides: PersistedSlideshowV4['collections'][number]['slides'][number][] = [];
    for (const rawSlide of parsed.data.slides) {
      const slide = savedSlide.safeParse(rawSlide);
      if (!slide.success || slideIds.has(slide.data.mediaId)) {
        damaged += 1;
        continue;
      }
      const { mediaId, fit, image } = slide.data;
      if (image === undefined && libraryIds.has(mediaId)) {
        slides.push({ mediaId, fit });
      } else if (
        isMediaItem(image) &&
        image.id === mediaId &&
        !libraryIds.has(mediaId) &&
        !ownedIds.has(mediaId)
      ) {
        ownedIds.add(mediaId);
        slides.push({ mediaId, fit, image: toPersistedMediaItem(image) });
      } else {
        damaged += 1;
        continue;
      }
      slideIds.add(mediaId);
    }
    collections.push({ ...parsed.data, slides });
  }
  const savedActiveId = raw['activeId'];
  const activeId = typeof savedActiveId === 'string' && ids.has(savedActiveId) ? savedActiveId : null;
  if (damaged > 0) warnings.push('Skipped damaged, duplicate or missing slideshow entries.');
  if (activeId === null && savedActiveId !== null && savedActiveId !== undefined)
    warnings.push('Cleared the unavailable active slideshow.');
  const showCountdown = raw['showCountdown'];
  return { collections, activeId, ...(typeof showCountdown === 'boolean' ? { showCountdown } : {}) };
}

function normalizeTimer(raw: unknown, warnings: string[]): PersistedTimerV4 {
  if (raw === undefined) return toPersistedTimer(DEFAULT_TIMER);
  if (isRecord(raw)) {
    const { durationSeconds, message, status, targetAt, remainingMs } = raw;
    if (isTimerDuration(durationSeconds) && isCountdownMessage(message)) {
      const settings = { durationSeconds, message: message.trim() };
      if (status === 'idle' || status === 'expired') return { ...settings, status };
      if (status === 'running' && isPositiveSafeInteger(targetAt)) return { ...settings, status, targetAt };
      if (status === 'paused' && isPositiveSafeInteger(remainingMs))
        return { ...settings, status, remainingMs };
    }
  }
  warnings.push('The saved countdown was damaged, so the default countdown was restored.');
  return toPersistedTimer(DEFAULT_TIMER);
}

function normalizeSavedGameLog(raw: unknown, warnings: string[]): PersistedGameLogV4 {
  const { state, dropped } = normalizeGameLog(raw);
  if (dropped > 0) {
    warnings.push(
      `Dropped ${dropped} damaged ${dropped === 1 ? 'entry' : 'entries'} from the games-played history.`,
    );
  }
  return toPersistedGameLog(state);
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

  const parsed = PersistedStateV4Schema.safeParse(data);
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
  const { media, warnings: mediaWarnings } = normalizeMedia(parsed.data.media);
  warnings.push(...mediaWarnings);

  return {
    ok: true,
    warnings,
    state: {
      schemaVersion: 4,
      savedAt: parsed.data.savedAt,
      game: {
        calledNumbers,
        bingoBannerVisible: parsed.data.game.bingoBannerVisible,
        disabledRows: normalizeDisabledRows(parsed.data.game.disabledRows),
      },
      presentation: { mode: parsed.data.presentation.mode },
      patterns,
      media,
      timer: normalizeTimer(parsed.data.timer, warnings),
      slideshow: normalizeSlideshow(parsed.data.slideshow, media.library, warnings),
      gameLog: normalizeSavedGameLog(parsed.data.gameLog, warnings),
      settings: {
        preferredDisplayId: parsed.data.settings.preferredDisplayId,
        controllerTheme: parsed.data.settings.controllerTheme,
      },
    },
  };
}
