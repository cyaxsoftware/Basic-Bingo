/**
 * The log of games played: when each started, what was played and how long it took.
 *
 * Pure rules, no clock and no storage: the main process feeds in what changed and the time. The log is kept apart
 * from GameState on purpose. The game rules never see a timestamp, and a New Game still clears nothing here.
 *
 * What counts as a game:
 *  - It starts when the first ball is called (the calls go from none to some).
 *  - It ends at the last BINGO CALLED press before New Game. A false bingo is one that play carried on past, so it
 *    is simply not the last press and never counts; no press at all means no duration.
 *  - It is logged when New Game is pressed with at least one ball called. An empty game is never logged.
 */
import type { GameCommand, GameState } from '../game/gameState';

export interface GameRecord {
  readonly id: string;
  /** When the first ball was called (epoch milliseconds). */
  readonly startedAt: number;
  /** The pattern being played when the game ended. */
  readonly title: string;
  /** First ball to the last BINGO CALLED press, in whole seconds; null when BINGO was never called. */
  readonly durationSeconds: number | null;
}

/** The game in progress. Both are null while no ball is called. */
export interface GameClock {
  readonly firstBallAt: number | null;
  readonly lastBingoAt: number | null;
}

export interface GameLogState {
  /** Finished games, oldest first. */
  readonly records: readonly GameRecord[];
  readonly current: GameClock;
}

export const MAX_GAME_RECORDS = 200;
const MAX_TITLE_LENGTH = 60;
const FALLBACK_TITLE = 'Untitled pattern';

const NO_CLOCK: GameClock = Object.freeze({ firstBallAt: null, lastBingoAt: null });

export const EMPTY_GAME_LOG: GameLogState = Object.freeze({
  records: Object.freeze([]),
  current: NO_CLOCK,
});

export interface GameChange {
  readonly command: GameCommand;
  readonly before: GameState;
  readonly after: GameState;
  /** Epoch milliseconds when the command was applied. */
  readonly now: number;
  /** The working pattern's title at this moment (used when the game ends). */
  readonly patternTitle: string;
  readonly newId: () => string;
}

function cleanTitle(title: string): string {
  const trimmed = title.trim().slice(0, MAX_TITLE_LENGTH).trim();
  return trimmed === '' ? FALLBACK_TITLE : trimmed;
}

const clockIsEmpty = (clock: GameClock) => clock.firstBallAt === null && clock.lastBingoAt === null;

/** The log after one game command was applied. Returns the same object when nothing about the log changes. */
export function applyGameChange(log: GameLogState, change: GameChange): GameLogState {
  const { command, before, after, now } = change;

  if (command.type === 'newGame') {
    const { firstBallAt, lastBingoAt } = log.current;
    // A game with calls but no recorded start (a save from before the log existed) cannot be timed, so it is skipped.
    if (before.calledNumbers.length === 0 || firstBallAt === null) {
      return clockIsEmpty(log.current) ? log : { ...log, current: NO_CLOCK };
    }
    const record: GameRecord = {
      id: change.newId(),
      startedAt: firstBallAt,
      title: cleanTitle(change.patternTitle),
      durationSeconds:
        lastBingoAt === null ? null : Math.max(0, Math.round((lastBingoAt - firstBallAt) / 1000)),
    };
    return { records: [...log.records, record].slice(-MAX_GAME_RECORDS), current: NO_CLOCK };
  }

  if (command.type === 'toggleBall') {
    if (after.calledNumbers.length === 0) {
      // Every call was taken back, so the game is empty again and its clock starts over.
      return clockIsEmpty(log.current) ? log : { ...log, current: NO_CLOCK };
    }
    if (before.calledNumbers.length === 0) {
      return { ...log, current: { firstBallAt: now, lastBingoAt: null } };
    }
    return log;
  }

  if (command.type === 'showBingoBanner') {
    if (!before.bingoBannerVisible && after.bingoBannerVisible && after.calledNumbers.length > 0) {
      return { ...log, current: { ...log.current, lastBingoAt: now } };
    }
    return log;
  }

  return log;
}

/** Empty the history (the game in progress keeps its clock). */
export function clearGameRecords(log: GameLogState): GameLogState {
  return log.records.length === 0 ? log : { ...log, records: [] };
}

// ---------------------------------------------------------------------------
// Reading a saved log (lenient: one damaged entry must not cost the rest)
// ---------------------------------------------------------------------------

const isEpoch = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

function toRecord(raw: unknown): GameRecord | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { id, startedAt, title, durationSeconds } = raw as Record<string, unknown>;
  if (typeof id !== 'string' || id === '' || id.length > 64) return null;
  if (!isEpoch(startedAt)) return null;
  if (typeof title !== 'string') return null;
  if (durationSeconds !== null && !(isEpoch(durationSeconds) && Number.isInteger(durationSeconds))) {
    return null;
  }
  return { id, startedAt, title: cleanTitle(title), durationSeconds };
}

export interface NormalizedGameLog {
  readonly state: GameLogState;
  /** How many saved entries were dropped because they were damaged. */
  readonly dropped: number;
}

/** Turn whatever was saved into a valid log; anything unusable falls back to empty. */
export function normalizeGameLog(raw: unknown): NormalizedGameLog {
  if (typeof raw !== 'object' || raw === null) return { state: EMPTY_GAME_LOG, dropped: 0 };
  const { records: rawRecords, current: rawCurrent } = raw as Record<string, unknown>;

  const records: GameRecord[] = [];
  let dropped = 0;
  const seen = new Set<string>();
  for (const candidate of Array.isArray(rawRecords) ? rawRecords : []) {
    const record = toRecord(candidate);
    if (record === null || seen.has(record.id)) {
      dropped += 1;
      continue;
    }
    seen.add(record.id);
    records.push(record);
  }

  let firstBallAt: number | null = null;
  let lastBingoAt: number | null = null;
  if (typeof rawCurrent === 'object' && rawCurrent !== null) {
    const clock = rawCurrent as Record<string, unknown>;
    if (isEpoch(clock['firstBallAt'])) {
      firstBallAt = clock['firstBallAt'];
      if (isEpoch(clock['lastBingoAt']) && clock['lastBingoAt'] >= firstBallAt) {
        lastBingoAt = clock['lastBingoAt'];
      }
    }
  }

  return {
    state: { records: records.slice(-MAX_GAME_RECORDS), current: { firstBallAt, lastBingoAt } },
    dropped,
  };
}

// ---------------------------------------------------------------------------
// Showing it
// ---------------------------------------------------------------------------

/** "14:32", or "1:02:10" past an hour; an em dash when there is no duration. */
export function formatGameDuration(seconds: number | null): string {
  if (seconds === null) return '—';
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const two = (n: number) => String(n).padStart(2, '0');
  return hours > 0 ? `${hours}:${two(minutes)}:${two(secs)}` : `${minutes}:${two(secs)}`;
}

/**
 * The start time as the operator reads it: "7:05 PM" for a game today, with the day ("Nov 21, 7:05 PM") when it
 * was another day. `now` and `timeZone` are for tests; the app uses the current time and the computer's own zone.
 */
export function formatGameStart(startedAt: number, now: number = Date.now(), timeZone?: string): string {
  const zone = timeZone === undefined ? {} : { timeZone };
  const day = (ms: number) => new Date(ms).toLocaleDateString('en-US', zone);
  const time = new Date(startedAt).toLocaleTimeString('en-US', {
    ...zone,
    hour: 'numeric',
    minute: '2-digit',
  });
  if (day(startedAt) === day(now)) return time;
  const date = new Date(startedAt).toLocaleDateString('en-US', { ...zone, month: 'short', day: 'numeric' });
  return `${date}, ${time}`;
}
