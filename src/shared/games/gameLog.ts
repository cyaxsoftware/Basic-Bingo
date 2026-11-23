/**
 * The log of games played: when each started, what was played and how long it took.
 *
 * Pure rules, no clock and no storage: the main process feeds in what changed and the time. The log is kept apart
 * from GameState on purpose. The game rules never see a timestamp, and a New Game still clears nothing here.
 *
 * What counts as a game:
 *  - It starts when the first ball is called (the calls go from none to some).
 *  - BINGO CALLED holds the clock. Pressing the button again (Dismiss) resumes it, continuing from where it was
 *    held, so the time spent verifying a card is not game time.
 *  - It ends at the last BINGO CALLED press, provided no ball was called (or taken back) after it. A press that
 *    play carried on past was a false bingo and is forgotten, and the time it was held is left out of the
 *    duration. If the operator never pressed BINGO CALLED (or forgot to for the real bingo) the game ends when
 *    New Game is confirmed.
 *  - It is logged when New Game is confirmed with at least one ball called. An empty game is never logged.
 */
import type { GameCommand, GameState } from '../game/gameState';

export interface GameRecord {
  readonly id: string;
  /** 1 for the first game since the history was last cleared; never changes, even when old games age out. */
  readonly number: number;
  /** When the first ball was called (epoch milliseconds). */
  readonly startedAt: number;
  /** The pattern being played when the game ended. */
  readonly title: string;
  /** First ball to the end of the game (see above), in whole seconds. */
  readonly durationSeconds: number;
}

/** The game in progress. Everything but `pausedMs` is null while no ball is called. */
export interface GameClock {
  readonly firstBallAt: number | null;
  /** The last BINGO CALLED press, until a ball is called after it (then that press was a false bingo). */
  readonly lastBingoAt: number | null;
  /** When that press was dismissed, so the clock resumed; null while it is still up. */
  readonly resumedAt: number | null;
  /** Milliseconds the clock was held for presses that turned out to be false bingos. */
  readonly pausedMs: number;
  /** The pattern being played when that press was made: the game's name if the press turns out to be its end. */
  readonly bingoTitle: string | null;
}

export interface GameLogState {
  /** Finished games, oldest first. */
  readonly records: readonly GameRecord[];
  readonly current: GameClock;
}

export const MAX_GAME_RECORDS = 200;
const MAX_TITLE_LENGTH = 60;
const FALLBACK_TITLE = 'Untitled pattern';

const NO_CLOCK: GameClock = Object.freeze({
  firstBallAt: null,
  lastBingoAt: null,
  resumedAt: null,
  pausedMs: 0,
  bingoTitle: null,
});

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

const clockIsEmpty = (clock: GameClock) =>
  clock.firstBallAt === null &&
  clock.lastBingoAt === null &&
  clock.resumedAt === null &&
  clock.pausedMs === 0 &&
  clock.bingoTitle === null;

/** The log after one game command was applied. Returns the same object when nothing about the log changes. */
export function applyGameChange(log: GameLogState, change: GameChange): GameLogState {
  const { command, before, after, now } = change;

  if (command.type === 'newGame') {
    const { firstBallAt, lastBingoAt, pausedMs, bingoTitle } = log.current;
    // A game with calls but no recorded start (a save from before the log existed) cannot be timed, so it is skipped.
    if (before.calledNumbers.length === 0 || firstBallAt === null) {
      return clockIsEmpty(log.current) ? log : { ...log, current: NO_CLOCK };
    }
    // No valid BINGO CALLED press means the operator forgot it, so the game ended when New Game was confirmed.
    const endedAt = lastBingoAt ?? now;
    const record: GameRecord = {
      id: change.newId(),
      number: nextGameNumber(log),
      startedAt: firstBallAt,
      // A game that ended at a BINGO CALLED press is named for the pattern at that press, even if the operator has
      // already picked the next pattern by the time they confirm New Game.
      title: lastBingoAt !== null && bingoTitle !== null ? bingoTitle : cleanTitle(change.patternTitle),
      // Whole seconds, rounded down, exactly as the game clock shows them, so the log never disagrees with it.
      durationSeconds: Math.max(0, Math.floor((endedAt - firstBallAt - pausedMs) / 1000)),
    };
    return { records: [...log.records, record].slice(-MAX_GAME_RECORDS), current: NO_CLOCK };
  }

  if (command.type === 'toggleBall') {
    if (after.calledNumbers.length === 0) {
      // Every call was taken back, so the game is empty again and its clock starts over.
      return clockIsEmpty(log.current) ? log : { ...log, current: NO_CLOCK };
    }
    if (before.calledNumbers.length === 0) {
      return { ...log, current: { ...NO_CLOCK, firstBallAt: now } };
    }
    // Play went on after a BINGO CALLED press, so that press was a false bingo (or the card was being corrected):
    // the press is forgotten and the time it was held (up to the dismiss, or until now) is not game time.
    const { lastBingoAt, resumedAt, pausedMs } = log.current;
    if (lastBingoAt === null) return log;
    const held = (resumedAt ?? now) - lastBingoAt;
    return {
      ...log,
      current: {
        ...log.current,
        lastBingoAt: null,
        resumedAt: null,
        bingoTitle: null,
        pausedMs: pausedMs + Math.max(0, held),
      },
    };
  }

  if (command.type === 'showBingoBanner') {
    if (!before.bingoBannerVisible && after.bingoBannerVisible && after.calledNumbers.length > 0) {
      // A press dismissed and then pressed again with no call between: the first hold was not the end of the game.
      const { lastBingoAt, resumedAt, pausedMs } = log.current;
      const earlier = lastBingoAt !== null && resumedAt !== null ? Math.max(0, resumedAt - lastBingoAt) : 0;
      return {
        ...log,
        current: {
          ...log.current,
          lastBingoAt: now,
          resumedAt: null,
          pausedMs: pausedMs + earlier,
          bingoTitle: cleanTitle(change.patternTitle),
        },
      };
    }
    return log;
  }

  if (command.type === 'dismissBingoBanner') {
    // Pressing BINGO CALLED again resumes the clock, continuing from where it was held.
    const { lastBingoAt, resumedAt } = log.current;
    if (
      before.bingoBannerVisible &&
      !after.bingoBannerVisible &&
      lastBingoAt !== null &&
      resumedAt === null
    ) {
      return { ...log, current: { ...log.current, resumedAt: now } };
    }
    return log;
  }

  return log;
}

/** True while the clock is held at a BINGO CALLED press (the banner is up and no ball has been called since). */
export function isClockHeld(clock: GameClock): boolean {
  return clock.firstBallAt !== null && clock.lastBingoAt !== null && clock.resumedAt === null;
}

/**
 * What the game clock shows, in milliseconds: time since the first ball, minus the time spent verifying false
 * bingos, held still at a BINGO CALLED press and running again once it is dismissed. 0 before the first ball.
 */
export function gameElapsedMs(clock: GameClock, now: number): number {
  const { firstBallAt, lastBingoAt, resumedAt, pausedMs } = clock;
  if (firstBallAt === null) return 0;
  if (lastBingoAt !== null && resumedAt === null) return Math.max(0, lastBingoAt - firstBallAt - pausedMs);
  // Dismissed with no ball called since: the clock runs on, but not for the time the card was being checked.
  const checking = lastBingoAt !== null && resumedAt !== null ? Math.max(0, resumedAt - lastBingoAt) : 0;
  return Math.max(0, now - firstBallAt - pausedMs - checking);
}

/** The number of the game being played (or about to be): one more than the last game logged. */
export function nextGameNumber(log: GameLogState): number {
  return (log.records.at(-1)?.number ?? 0) + 1;
}

/** Empty the history (the game in progress keeps its clock). */
export function clearGameRecords(log: GameLogState): GameLogState {
  return log.records.length === 0 ? log : { ...log, records: [] };
}

// ---------------------------------------------------------------------------
// Reading a saved log (lenient: one damaged entry must not cost the rest)
// ---------------------------------------------------------------------------

const isEpoch = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER;

function toRecord(raw: unknown): GameRecord | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { id, number, startedAt, title, durationSeconds } = raw as Record<string, unknown>;
  if (typeof id !== 'string' || id === '' || id.length > 64) return null;
  // Safe with room for +1: at the top of the range adding one gives the same number back and numbering stalls.
  if (typeof number !== 'number' || !Number.isInteger(number) || number < 1) return null;
  if (!Number.isSafeInteger(number + 1)) return null;
  if (!isEpoch(startedAt)) return null;
  if (typeof title !== 'string') return null;
  if (!isEpoch(durationSeconds) || !Number.isInteger(durationSeconds)) return null;
  return { id, number, startedAt, title: cleanTitle(title), durationSeconds };
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

  let current: GameClock = NO_CLOCK;
  if (typeof rawCurrent === 'object' && rawCurrent !== null) {
    const clock = rawCurrent as Record<string, unknown>;
    const { firstBallAt, lastBingoAt, resumedAt, pausedMs, bingoTitle } = clock;
    if (isEpoch(firstBallAt)) {
      const last = isEpoch(lastBingoAt) && lastBingoAt >= firstBallAt ? lastBingoAt : null;
      const resumed = last !== null && isEpoch(resumedAt) && resumedAt >= last ? resumedAt : null;
      current = {
        firstBallAt,
        lastBingoAt: last,
        resumedAt: resumed,
        pausedMs: isEpoch(pausedMs) ? Math.round(pausedMs) : 0,
        // Only meaningful with a live press; without it the New Game title is used.
        bingoTitle: last !== null && typeof bingoTitle === 'string' ? cleanTitle(bingoTitle) : null,
      };
    }
  }

  return { state: { records: records.slice(-MAX_GAME_RECORDS), current }, dropped };
}

// ---------------------------------------------------------------------------
// Showing it
// ---------------------------------------------------------------------------

/** "14:32", or "1:02:10" past an hour. */
export function formatGameDuration(seconds: number): string {
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
