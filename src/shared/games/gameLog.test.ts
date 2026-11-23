import { describe, expect, it } from 'vitest';
import { INITIAL_GAME_STATE, reduceGame, type GameCommand, type GameState } from '../game/gameState';
import {
  applyGameChange,
  clearGameRecords,
  EMPTY_GAME_LOG,
  formatGameDuration,
  formatGameStart,
  MAX_GAME_RECORDS,
  normalizeGameLog,
  type GameLogState,
} from './gameLog';

const SECOND = 1000;
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
      { id: 'game-1', startedAt: START, title: 'Four Corners', durationSeconds: 240 },
    ]);
    expect(night.log.current).toEqual({ firstBallAt: null, lastBingoAt: null });
  });

  it('is not logged until New Game', () => {
    const night = new Night().ball(5).ball(17, 30).bingo(60);
    expect(night.log.records).toEqual([]);
    expect(night.log.current).toEqual({ firstBallAt: START, lastBingoAt: START + 90 * SECOND });
  });

  it('counts to the last BINGO CALLED press, so a false bingo play carried on past is ignored', () => {
    const night = new Night();
    night.ball(5).ball(17, 60).bingo(30); // a false bingo at 1:30
    night.dismiss(20).ball(40, 100).ball(52, 60).bingo(90).newGame(10); // the real one
    expect(night.log.records[0]?.durationSeconds).toBe(60 + 30 + 20 + 100 + 60 + 90);
  });

  it('ends the game when New Game is confirmed if BINGO CALLED was never pressed', () => {
    const night = new Night().ball(5).ball(17, 30).newGame(10);
    expect(night.log.records).toEqual([
      { id: 'game-1', startedAt: START, title: 'Four Corners', durationSeconds: 40 },
    ]);
  });

  it('also falls back to New Game when the only press was a false bingo and the real one was forgotten', () => {
    const night = new Night();
    night.ball(5).ball(17, 60).bingo(30); // false at 1:30, then play carries on
    night.dismiss(20).ball(40, 100).ball(52, 60).newGame(90); // the real bingo was never pressed
    expect(night.log.current.lastBingoAt).toBeNull();
    expect(night.log.records[0]?.durationSeconds).toBe(60 + 30 + 20 + 100 + 60 + 90);
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

  it('uses the pattern being played when the game ends', () => {
    const night = new Night().ball(5).bingo(10);
    night.title = '  Big L  ';
    night.newGame();
    expect(night.log.records[0]?.title).toBe('Big L');
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
    expect(night.log.current).toEqual({ firstBallAt: null, lastBingoAt: null });
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

  it('times a re-raised banner from the press that raised it', () => {
    const night = new Night().ball(5).bingo(10).dismiss(5).bingo(20).newGame();
    expect(night.log.records[0]?.durationSeconds).toBe(35);
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

  it('ignores commands that do not start, time or end a game', () => {
    const night = new Night().ball(5);
    const before = night.log;
    night.do({ type: 'toggleRowDisabled', letter: 'B' }).dismiss();
    expect(night.log).toBe(before);
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
  const good = { id: 'a', startedAt: START, title: 'Big L', durationSeconds: 61 };

  it('keeps a good log and a good clock', () => {
    const { state, dropped } = normalizeGameLog({
      records: [good, { ...good, id: 'b', durationSeconds: 0 }],
      current: { firstBallAt: START, lastBingoAt: START + 5000 },
    });
    expect(dropped).toBe(0);
    expect(state.records).toHaveLength(2);
    expect(state.current).toEqual({ firstBallAt: START, lastBingoAt: START + 5000 });
  });

  it.each([undefined, null, 'x', 7, [], { records: 'nope' }])('falls back to empty for %j', (raw) => {
    expect(normalizeGameLog(raw).state.records).toEqual([]);
    expect(normalizeGameLog(raw).state.current).toEqual({ firstBallAt: null, lastBingoAt: null });
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
        { ...good, id: 'f', durationSeconds: -3 },
        { ...good, id: 'g', title: 7 },
        { ...good },
        null,
        'x',
      ],
    });
    expect(state.records.map((r) => r.id)).toEqual(['a']);
    expect(dropped).toBe(10);
  });

  it('repairs a title and ignores a clock that makes no sense', () => {
    const { state } = normalizeGameLog({
      records: [{ ...good, title: '   ' }],
      current: { firstBallAt: START, lastBingoAt: START - 1 },
    });
    expect(state.records[0]?.title).toBe('Untitled pattern');
    expect(state.current).toEqual({ firstBallAt: START, lastBingoAt: null });
    expect(normalizeGameLog({ current: { firstBallAt: null, lastBingoAt: START } }).state.current).toEqual({
      firstBallAt: null,
      lastBingoAt: null,
    });
  });

  it('caps a huge saved list', () => {
    const records = Array.from({ length: MAX_GAME_RECORDS + 20 }, (_, i) => ({ ...good, id: `r${i}` }));
    const { state } = normalizeGameLog({ records });
    expect(state.records).toHaveLength(MAX_GAME_RECORDS);
    expect(state.records.at(-1)?.id).toBe(`r${MAX_GAME_RECORDS + 19}`);
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
