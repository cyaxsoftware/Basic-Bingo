import { describe, expect, it } from 'vitest';
import { INITIAL_GAME_STATE, reduceGame, type GameCommand, type GameState } from '../game/gameState';
import {
  applyGameChange,
  clearGameRecords,
  EMPTY_GAME_LOG,
  formatGameDuration,
  gameElapsedMs,
  isClockHeld,
  formatGameStart,
  MAX_GAME_RECORDS,
  nextGameNumber,
  normalizeGameLog,
  type GameClock,
  type GameLogState,
} from './gameLog';

const SECOND = 1000;
const NO_CLOCK: GameClock = {
  firstBallAt: null,
  lastBingoAt: null,
  resumedAt: null,
  pausedMs: 0,
  bingoTitle: null,
};
const START = Date.UTC(2026, 10, 22, 19, 5, 0);

/** Drives the log the way the store does: apply the game command, then tell the log what changed. */
class Night {
  game: GameState = INITIAL_GAME_STATE;
  log: GameLogState = EMPTY_GAME_LOG;
  title = 'Four Corners';
  now = START;
  private ids = 0;

  do(command: GameCommand, afterSeconds = 0): this {
    this.now += afterSeconds * SECOND;
    const before = this.game;
    this.game = reduceGame(before, command);
    this.log = applyGameChange(this.log, {
      command,
      before,
      after: this.game,
      now: this.now,
      patternTitle: this.title,
      newId: () => `game-${++this.ids}`,
    });
    return this;
  }
  ball(n: number, afterSeconds = 0) {
    return this.do({ type: 'toggleBall', ball: n as never }, afterSeconds);
  }
  bingo(afterSeconds = 0) {
    return this.do({ type: 'showBingoBanner' }, afterSeconds);
  }
  dismiss(afterSeconds = 0) {
    return this.do({ type: 'dismissBingoBanner' }, afterSeconds);
  }
  newGame(afterSeconds = 0) {
    return this.do({ type: 'newGame' }, afterSeconds);
  }
}

describe('a game in the log', () => {
  it('runs from the first ball to the BINGO CALLED press, and is logged on New Game', () => {
    const night = new Night();
    night.ball(5).ball(17, 30).ball(40, 90).bingo(120).dismiss(10).newGame(5);

    expect(night.log.records).toEqual([
      { id: 'game-1', number: 1, startedAt: START, title: 'Four Corners', durationSeconds: 240 },
    ]);
    expect(night.log.current).toEqual(NO_CLOCK);
  });

  it('is not logged until New Game', () => {
    const night = new Night().ball(5).ball(17, 30).bingo(60);
    expect(night.log.records).toEqual([]);
    expect(night.log.current).toEqual({
      firstBallAt: START,
      lastBingoAt: START + 90 * SECOND,
      resumedAt: null,
      pausedMs: 0,
      bingoTitle: 'Four Corners',
    });
  });

  it('counts to the last BINGO CALLED press, so a false bingo play carried on past is ignored', () => {
    const night = new Night();
    night.ball(5).ball(17, 60).bingo(30); // a false bingo at 1:30
    night.dismiss(20).ball(40, 100).ball(52, 60).bingo(90).newGame(10); // the real one
    expect(night.log.records[0]?.durationSeconds).toBe(60 + 30 + 20 + 100 + 60 + 90 - 20);
  });

  it('ends the game when New Game is confirmed if BINGO CALLED was never pressed', () => {
    const night = new Night().ball(5).ball(17, 30).newGame(10);
    expect(night.log.records).toEqual([
      { id: 'game-1', number: 1, startedAt: START, title: 'Four Corners', durationSeconds: 40 },
    ]);
  });

  it('also falls back to New Game when the only press was a false bingo and the real one was forgotten', () => {
    const night = new Night();
    night.ball(5).ball(17, 60).bingo(30); // false at 1:30, then play carries on
    night.dismiss(20).ball(40, 100).ball(52, 60).newGame(90); // the real bingo was never pressed
    expect(night.log.current.lastBingoAt).toBeNull();
    // The 20 s the false bingo was up is not game time.
    expect(night.log.records[0]?.durationSeconds).toBe(60 + 30 + 20 + 100 + 60 + 90 - 20);
  });

  it('forgets a press once any call is made or taken back after it', () => {
    const afterNewCall = new Night().ball(5).bingo(10).dismiss().ball(6, 5);
    expect(afterNewCall.log.current.lastBingoAt).toBeNull();
    const afterCorrection = new Night().ball(5).ball(6, 5).bingo(10).dismiss().ball(6, 5);
    expect(afterCorrection.log.current.lastBingoAt).toBeNull();
  });

  it('keeps a press when only the banner is dismissed or a row is blacked out after it', () => {
    const night = new Night().ball(5).bingo(10).dismiss(5);
    night.do({ type: 'toggleRowDisabled', letter: 'B' });
    expect(night.log.current.lastBingoAt).toBe(START + 10 * SECOND);
  });

  it('uses the pattern being played when New Game ends a game that no BINGO CALLED ended', () => {
    const night = new Night().ball(5).ball(6, 10);
    night.title = '  Big L  ';
    night.newGame();
    expect(night.log.records[0]?.title).toBe('Big L');
  });

  it('names a game that ended at BINGO CALLED for the pattern at that press, not the next one picked', () => {
    // Four Corners wins; the operator dismisses the banner and picks Big L for the next game, then confirms New Game.
    const night = new Night().ball(5).ball(6, 30).bingo(30).dismiss(5);
    night.title = 'Big L';
    night.newGame(20);
    expect(night.log.records[0]).toMatchObject({ title: 'Four Corners', durationSeconds: 60 });
  });

  it('forgets the press title with the press: a false bingo does not name the game', () => {
    // A false bingo under Four Corners, then play carries on under Big L and the real bingo is never pressed.
    const night = new Night().ball(5).bingo(10).dismiss(5);
    night.title = 'Big L';
    night.ball(6, 5).newGame(10);
    expect(night.log.current).toEqual(NO_CLOCK);
    expect(night.log.records[0]?.title).toBe('Big L');
  });

  it('takes the title from the latest press when the banner is raised again', () => {
    const night = new Night().ball(5).bingo(10).dismiss(5);
    night.title = 'Big L';
    night.bingo(5).newGame();
    expect(night.log.records[0]?.title).toBe('Big L');
  });

  it('shows the same whole seconds on the held clock and in the log (no 0:10 held, 0:11 logged)', () => {
    const night = new Night().ball(5);
    night.now += 10_750; // 10.750 s after the first ball
    night.do({ type: 'showBingoBanner' });
    const shown = Math.floor(gameElapsedMs(night.log.current, night.now) / 1000);
    night.newGame();
    expect(shown).toBe(10);
    expect(night.log.records[0]?.durationSeconds).toBe(shown);
  });

  it('falls back to a name for a blank title and trims an over-long one', () => {
    const blank = new Night().ball(5);
    blank.title = '   ';
    expect(blank.newGame().log.records[0]?.title).toBe('Untitled pattern');
    const long = new Night().ball(5);
    long.title = 'x'.repeat(100);
    expect(long.newGame().log.records[0]?.title).toHaveLength(60);
  });

  it('logs nothing for New Game on an empty game, even twice in a row', () => {
    const night = new Night().newGame().newGame(5);
    expect(night.log).toBe(EMPTY_GAME_LOG);
  });

  it('starts the next game at its first ball, not at New Game', () => {
    const night = new Night();
    night.ball(5).bingo(60).newGame(10);
    night.ball(9, 600).ball(10, 45).bingo(15).newGame(1);
    expect(night.log.records.map((r) => [r.id, r.startedAt - START, r.durationSeconds])).toEqual([
      ['game-1', 0, 60],
      ['game-2', (60 + 10 + 600) * SECOND, 60],
    ]);
  });

  it('starts the clock over when every call is taken back', () => {
    const night = new Night().ball(5).bingo(10).dismiss();
    night.ball(5, 20);
    expect(night.game.calledNumbers).toEqual([]);
    expect(night.log.current).toEqual(NO_CLOCK);
    night.ball(7, 100).bingo(30).newGame();
    expect(night.log.records[0]).toMatchObject({ startedAt: START + 130 * SECOND, durationSeconds: 30 });
  });

  it('keeps the first-ball time when a call in the middle is taken back and made again', () => {
    const night = new Night().ball(5).ball(6, 10).ball(6, 10).ball(6, 10).bingo(10).newGame();
    expect(night.log.records[0]).toMatchObject({ startedAt: START, durationSeconds: 40 });
  });

  it('ignores a BINGO CALLED press with no calls, and one while the banner is already up', () => {
    const early = new Night().bingo();
    expect(early.log).toBe(EMPTY_GAME_LOG);
    const twice = new Night().ball(5).bingo(10).bingo(50);
    expect(twice.log.current.lastBingoAt).toBe(START + 10 * SECOND);
  });

  it('times a re-raised banner from the press that raised it, leaving out the first hold', () => {
    const night = new Night().ball(5).bingo(10).dismiss(5).bingo(20).newGame();
    expect(night.log.records[0]?.durationSeconds).toBe(35 - 5);
  });

  it('does not log a game that had calls before the log existed (its start is unknown)', () => {
    const game: GameState = { ...INITIAL_GAME_STATE, calledNumbers: [3, 4] as never };
    const result = applyGameChange(EMPTY_GAME_LOG, {
      command: { type: 'newGame' },
      before: game,
      after: INITIAL_GAME_STATE,
      now: START,
      patternTitle: 'Four Corners',
      newId: () => 'x',
    });
    expect(result).toBe(EMPTY_GAME_LOG);
  });

  it('resumes the clock when BINGO CALLED is dismissed, and remembers when', () => {
    const night = new Night().ball(5).bingo(10);
    expect(isClockHeld(night.log.current)).toBe(true);
    night.dismiss(20);
    expect(night.log.current).toEqual({
      firstBallAt: START,
      lastBingoAt: START + 10 * SECOND,
      resumedAt: START + 30 * SECOND,
      pausedMs: 0,
      bingoTitle: 'Four Corners',
    });
    expect(isClockHeld(night.log.current)).toBe(false);
  });

  it('leaves the checking time of a false bingo out of the duration', () => {
    const night = new Night();
    night.ball(5).ball(17, 60).bingo(30); // pressed at 1:30
    night.dismiss(30); // checked for 30 s, found false, resumed at 2:00
    night.ball(40, 10).bingo(50).newGame(10); // the real bingo at 3:00
    expect(night.log.current).toEqual(NO_CLOCK);
    expect(night.log.records[0]?.durationSeconds).toBe(180 - 30);
  });

  it('ends a true bingo that was dismissed at its press, not at New Game', () => {
    const night = new Night().ball(5).ball(6, 50).bingo(10).dismiss(20).newGame(30);
    expect(night.log.records[0]?.durationSeconds).toBe(60);
  });

  it('cannot be interrupted by a call: balls are refused while the banner is up, so the hold stays', () => {
    const night = new Night().ball(5).bingo(10);
    expect(() => night.ball(6, 25)).toThrow(/Dismiss it/);
    expect(night.log.current).toMatchObject({
      lastBingoAt: START + 10 * SECOND,
      resumedAt: null,
      pausedMs: 0,
      bingoTitle: 'Four Corners',
    });
  });

  it('ignores a dismiss that follows no press', () => {
    const night = new Night().ball(5);
    night.do({ type: 'dismissBingoBanner' });
    expect(night.log.current.resumedAt).toBeNull();
  });

  it('ignores commands that do not start, time or end a game', () => {
    const night = new Night().ball(5);
    const before = night.log;
    night.do({ type: 'toggleRowDisabled', letter: 'B' }).dismiss();
    expect(night.log).toBe(before);
  });

  it('numbers games 1, 2, 3 in the order they were played, and the next one after them', () => {
    const night = new Night();
    expect(nextGameNumber(night.log)).toBe(1);
    night.ball(5).newGame();
    expect(nextGameNumber(night.log)).toBe(2);
    night.ball(5, 1).newGame().ball(5, 1).newGame();
    expect(night.log.records.map((r) => r.number)).toEqual([1, 2, 3]);
    expect(nextGameNumber(night.log)).toBe(4);
  });

  it('starts numbering at 1 again after the history is cleared', () => {
    const night = new Night().ball(5).newGame().ball(5, 1).newGame();
    expect(nextGameNumber(clearGameRecords(night.log))).toBe(1);
  });

  it('keeps a game its number when old games age out of the list', () => {
    const night = new Night();
    for (let i = 0; i < MAX_GAME_RECORDS + 5; i++) night.ball(5, 1).newGame(1);
    expect(night.log.records[0]?.number).toBe(6);
    expect(night.log.records.at(-1)?.number).toBe(MAX_GAME_RECORDS + 5);
    expect(nextGameNumber(night.log)).toBe(MAX_GAME_RECORDS + 6);
  });

  it('keeps only the most recent games', () => {
    const night = new Night();
    for (let i = 0; i < MAX_GAME_RECORDS + 5; i++) night.ball(5, 1).newGame(1);
    expect(night.log.records).toHaveLength(MAX_GAME_RECORDS);
    expect(night.log.records.at(-1)?.id).toBe(`game-${MAX_GAME_RECORDS + 5}`);
  });
});

describe('clearGameRecords', () => {
  it('empties the history but keeps the timing of the game in progress', () => {
    const night = new Night().ball(5).bingo(10).newGame().ball(7, 5);
    const cleared = clearGameRecords(night.log);
    expect(cleared.records).toEqual([]);
    expect(cleared.current).toEqual(night.log.current);
  });

  it('returns the same object when there is nothing to clear', () => {
    expect(clearGameRecords(EMPTY_GAME_LOG)).toBe(EMPTY_GAME_LOG);
  });
});

describe('normalizeGameLog', () => {
  const good = { id: 'a', number: 1, startedAt: START, title: 'Big L', durationSeconds: 61 };

  it('keeps a good log and a good clock', () => {
    const { state, dropped } = normalizeGameLog({
      records: [good, { ...good, id: 'b', number: 2, durationSeconds: 0 }],
      current: {
        firstBallAt: START,
        lastBingoAt: START + 5000,
        resumedAt: START + 9000,
        pausedMs: 1500,
        bingoTitle: '  Big L ',
      },
    });
    expect(dropped).toBe(0);
    expect(state.records).toHaveLength(2);
    expect(state.current).toEqual({
      firstBallAt: START,
      lastBingoAt: START + 5000,
      resumedAt: START + 9000,
      pausedMs: 1500,
      bingoTitle: 'Big L',
    });
  });

  it('keeps a press title only with a live press, and falls back to no title otherwise', () => {
    const at = (current: unknown) => normalizeGameLog({ current }).state.current.bingoTitle;
    expect(at({ firstBallAt: START, lastBingoAt: START + 5, bingoTitle: 'Big L' })).toBe('Big L');
    expect(at({ firstBallAt: START, bingoTitle: 'Big L' })).toBeNull();
    for (const bad of [7, null, undefined, {}]) {
      expect(at({ firstBallAt: START, lastBingoAt: START + 5, bingoTitle: bad })).toBeNull();
    }
    expect(at({ firstBallAt: START, lastBingoAt: START + 5, bingoTitle: '   ' })).toBe('Untitled pattern');
  });

  it('refuses a game number so large that adding one would give the same number back', () => {
    const top = Number.MAX_SAFE_INTEGER;
    const result = normalizeGameLog({
      records: [good, { ...good, id: 'top', number: top }, { ...good, id: 'next', number: top - 1 }],
    });
    // MAX and MAX-1 both leave no room for a +1 that is a different number, so numbering could not go on.
    expect(result.state.records.map((r) => r.id)).toEqual(['a', 'next']);
    expect(result.dropped).toBe(1);
    expect(nextGameNumber({ ...result.state })).toBe(top);
    expect(Number.isSafeInteger(nextGameNumber(result.state))).toBe(true);
  });

  it('refuses start times and durations too large to be real', () => {
    const { state, dropped } = normalizeGameLog({
      records: [good, { ...good, id: 'x', startedAt: 1e300 }, { ...good, id: 'y', durationSeconds: 2 ** 60 }],
    });
    expect(state.records.map((r) => r.id)).toEqual(['a']);
    expect(dropped).toBe(2);
  });

  it.each([undefined, null, 'x', 7, [], { records: 'nope' }])('falls back to empty for %j', (raw) => {
    expect(normalizeGameLog(raw).state.records).toEqual([]);
    expect(normalizeGameLog(raw).state.current).toEqual(NO_CLOCK);
  });

  it('drops damaged and duplicate entries without losing the good ones', () => {
    const { state, dropped } = normalizeGameLog({
      records: [
        good,
        { ...good, id: '' },
        { ...good, id: 'c', startedAt: 'noon' },
        { ...good, id: 'd', startedAt: -1 },
        { ...good, id: 'e', durationSeconds: 1.5 },
        { ...good, id: 'n', durationSeconds: null },
        { ...good, id: 'z', number: 0 },
        { ...good, id: 'y', number: 1.5 },
        { ...good, id: 'x', number: '2' },
        { ...good, id: 'f', durationSeconds: -3 },
        { ...good, id: 'g', title: 7 },
        { ...good },
        null,
        'x',
      ],
    });
    expect(state.records.map((r) => r.id)).toEqual(['a']);
    expect(dropped).toBe(13);
  });

  it('repairs a title and ignores a clock that makes no sense', () => {
    const { state } = normalizeGameLog({
      records: [{ ...good, title: '   ' }],
      current: { firstBallAt: START, lastBingoAt: START - 1 },
    });
    expect(state.records[0]?.title).toBe('Untitled pattern');
    expect(state.current).toEqual({ ...NO_CLOCK, firstBallAt: START });
    expect(normalizeGameLog({ current: { firstBallAt: null, lastBingoAt: START } }).state.current).toEqual(
      NO_CLOCK,
    );
  });

  it('ignores a resume time that does not follow a press, and a damaged paused total', () => {
    const at = (current: unknown) => normalizeGameLog({ current }).state.current;
    expect(at({ firstBallAt: START, resumedAt: START + 5 })).toEqual({ ...NO_CLOCK, firstBallAt: START });
    expect(at({ firstBallAt: START, lastBingoAt: START + 10, resumedAt: START + 5 })).toEqual({
      ...NO_CLOCK,
      firstBallAt: START,
      lastBingoAt: START + 10,
    });
    for (const pausedMs of [-5, 'x', null, Number.NaN]) {
      expect(at({ firstBallAt: START, pausedMs }).pausedMs).toBe(0);
    }
    expect(at({ firstBallAt: START, pausedMs: 1234.4 }).pausedMs).toBe(1234);
  });

  it('caps a huge saved list', () => {
    const records = Array.from({ length: MAX_GAME_RECORDS + 20 }, (_, i) => ({
      ...good,
      id: `r${i}`,
      number: i + 1,
    }));
    const { state } = normalizeGameLog({ records });
    expect(state.records).toHaveLength(MAX_GAME_RECORDS);
    expect(state.records.at(-1)?.id).toBe(`r${MAX_GAME_RECORDS + 19}`);
  });
});

describe('what the clock shows', () => {
  const T = START;
  const clock = (over: Partial<GameClock> = {}): GameClock => ({ ...NO_CLOCK, firstBallAt: T, ...over });

  it('is 0 before the first ball', () => {
    expect(gameElapsedMs(NO_CLOCK, T + 99_000)).toBe(0);
    expect(isClockHeld(NO_CLOCK)).toBe(false);
  });

  it('runs from the first ball', () => {
    expect(gameElapsedMs(clock(), T + 75_000)).toBe(75_000);
  });

  it('holds at a BINGO CALLED press that is still up', () => {
    const held = clock({ lastBingoAt: T + 40_000 });
    expect(isClockHeld(held)).toBe(true);
    expect(gameElapsedMs(held, T + 40_000)).toBe(40_000);
    expect(gameElapsedMs(held, T + 500_000)).toBe(40_000);
  });

  it('carries on from the held value once it is dismissed, without the checking time', () => {
    const resumed = clock({ lastBingoAt: T + 40_000, resumedAt: T + 55_000 });
    expect(isClockHeld(resumed)).toBe(false);
    expect(gameElapsedMs(resumed, T + 55_000)).toBe(40_000);
    expect(gameElapsedMs(resumed, T + 70_000)).toBe(55_000);
  });

  it('leaves out earlier false bingos as well', () => {
    expect(gameElapsedMs(clock({ pausedMs: 20_000 }), T + 100_000)).toBe(80_000);
    const held = clock({ pausedMs: 20_000, lastBingoAt: T + 100_000 });
    expect(gameElapsedMs(held, T + 999_000)).toBe(80_000);
  });

  it('is never negative', () => {
    expect(gameElapsedMs(clock(), T - 5_000)).toBe(0);
    expect(gameElapsedMs(clock({ pausedMs: 90_000 }), T + 10_000)).toBe(0);
  });

  it('agrees with the logged duration when the game ends at a held press', () => {
    const night = new Night().ball(5).ball(6, 30).bingo(30).dismiss(15).ball(7, 5).bingo(40);
    const shown = gameElapsedMs(night.log.current, night.now);
    night.newGame();
    expect(night.log.records[0]?.durationSeconds).toBe(shown / 1000);
  });
});

describe('formatting', () => {
  it.each([
    [0, '0:00'],
    [9, '0:09'],
    [872, '14:32'],
    [3599, '59:59'],
    [3730, '1:02:10'],
    [-5, '0:00'],
  ])('shows %j seconds as %s', (seconds, text) => {
    expect(formatGameDuration(seconds)).toBe(text);
  });

  it('shows just the time for a game today and the day for another day', () => {
    const at = Date.UTC(2026, 10, 22, 19, 5);
    expect(formatGameStart(at, at + 3600_000, 'UTC')).toBe('7:05 PM');
    expect(formatGameStart(at, at + 26 * 3600_000, 'UTC')).toBe('Nov 22, 7:05 PM');
  });
});
