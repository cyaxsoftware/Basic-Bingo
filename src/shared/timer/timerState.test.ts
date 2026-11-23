import { describe, expect, it } from 'vitest';
import { DEFAULT_TIMER, MAX_TIMER_DURATION, reduceTimer, timerRemainingMs } from './timerState';

const now = 100_000;
const settings = { durationSeconds: 2, message: DEFAULT_TIMER.message };
const idle = { ...settings, status: 'idle' } as const;
const running = { ...settings, status: 'running', targetAt: now + 2000 } as const;
const paused = { ...settings, status: 'paused', remainingMs: 1679 } as const;
const expired = { ...settings, status: 'expired' } as const;

describe('countdown timer', () => {
  it('defaults to five minutes with the next game message', () => {
    expect(DEFAULT_TIMER).toEqual({ durationSeconds: 300, message: 'Next Game Begins In…', status: 'idle' });
    expect(timerRemainingMs(DEFAULT_TIMER, now)).toBe(300_000);
  });

  it.each([idle, expired])('starts a full countdown from $status', (timer) => {
    expect(reduceTimer(timer, { type: 'start' }, now)).toEqual(running);
  });

  it('uses the absolute target and expires at the exact millisecond', () => {
    expect(timerRemainingMs(running, now + 650)).toBe(1350);
    expect(timerRemainingMs(running, running.targetAt - 1)).toBe(1);
    expect(reduceTimer(running, { type: 'expire' }, running.targetAt - 1)).toBe(running);
    expect(reduceTimer(running, { type: 'expire' }, running.targetAt)).toEqual(expired);
    expect(reduceTimer(running, { type: 'pause' }, running.targetAt)).toEqual(expired);
    expect(timerRemainingMs(running, running.targetAt + 1)).toBe(0);
    expect(timerRemainingMs(expired, now)).toBe(0);
  });

  it('keeps the precise remainder across repeated pauses and resumes', () => {
    expect(reduceTimer(running, { type: 'pause' }, now + 321)).toEqual(paused);
    expect(timerRemainingMs(paused, now + 10_000)).toBe(1679);
    const resumed = reduceTimer(paused, { type: 'resume' }, now + 10_000);
    expect(resumed).toEqual({ ...settings, status: 'running', targetAt: now + 11_679 });
    const held = reduceTimer(resumed, { type: 'pause' }, now + 10_500);
    expect(timerRemainingMs(held, now + 20_000)).toBe(1179);
    const resumedAgain = reduceTimer(held, { type: 'resume' }, now + 20_000);
    expect(timerRemainingMs(resumedAgain, now + 21_178)).toBe(1);
    expect(reduceTimer(resumedAgain, { type: 'expire' }, now + 21_179)).toEqual(expired);
  });

  it.each([running, paused, expired])('resets $status to idle at the full duration', (timer) => {
    expect(reduceTimer(timer, { type: 'reset' }, now)).toEqual(idle);
  });

  it('keeps object identity for inapplicable commands and unchanged settings', () => {
    expect(reduceTimer(idle, { type: 'pause' }, now)).toBe(idle);
    expect(reduceTimer(idle, { type: 'resume' }, now)).toBe(idle);
    expect(reduceTimer(idle, { type: 'reset' }, now)).toBe(idle);
    expect(reduceTimer(paused, { type: 'pause' }, now)).toBe(paused);
    expect(reduceTimer(paused, { type: 'start' }, now)).toBe(paused);
    expect(reduceTimer(running, { type: 'start' }, now)).toBe(running);
    expect(reduceTimer(running, { type: 'resume' }, now)).toBe(running);
    expect(reduceTimer(expired, { type: 'expire' }, now)).toBe(expired);
    expect(reduceTimer(paused, { type: 'setDuration', durationSeconds: 2 }, now)).toBe(paused);
    expect(reduceTimer(running, { type: 'setMessage', message: ` ${running.message} ` }, now)).toBe(running);
  });

  it.each([idle, paused, expired])('sets a new duration from $status and returns to idle', (timer) => {
    for (const durationSeconds of [1, MAX_TIMER_DURATION]) {
      expect(reduceTimer(timer, { type: 'setDuration', durationSeconds }, now)).toEqual({
        ...idle,
        durationSeconds,
      });
    }
  });

  it.each([0, -1, 1.5, MAX_TIMER_DURATION + 1, NaN, Infinity, '5'])(
    'refuses invalid duration %j',
    (value) => {
      expect(() => reduceTimer(idle, { type: 'setDuration', durationSeconds: value as number }, now)).toThrow(
        RangeError,
      );
    },
  );

  it('refuses even an unchanged duration while running', () => {
    expect(() => reduceTimer(running, { type: 'setDuration', durationSeconds: 2 }, now)).toThrow(RangeError);
  });

  it('edits the projected message without touching the running deadline', () => {
    expect(reduceTimer(running, { type: 'setMessage', message: ' X ' }, now)).toEqual({
      ...running,
      message: 'X',
    });
    const message = 'x'.repeat(80);
    expect(reduceTimer(running, { type: 'setMessage', message }, now)).toEqual({ ...running, message });
  });

  it.each(['', '   ', 'x'.repeat(81), null])('refuses invalid message %j', (value) => {
    expect(() => reduceTimer(idle, { type: 'setMessage', message: value as string }, now)).toThrow(
      RangeError,
    );
  });
});
