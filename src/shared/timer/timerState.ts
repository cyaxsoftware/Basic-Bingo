export const MAX_TIMER_DURATION = 99 * 60 + 59;
export const MAX_COUNTDOWN_MESSAGE_LENGTH = 80;

type TimerSettings = {
  readonly durationSeconds: number;
  readonly message: string;
};

export type TimerState = TimerSettings &
  (
    | { readonly status: 'idle' | 'expired' }
    | { readonly status: 'running'; readonly targetAt: number }
    | { readonly status: 'paused'; readonly remainingMs: number }
  );

export const DEFAULT_TIMER: TimerState = Object.freeze({
  status: 'idle',
  durationSeconds: 5 * 60,
  message: 'Next Game Begins In…',
});

export type TimerCommand =
  | { readonly type: 'setDuration'; readonly durationSeconds: number }
  | { readonly type: 'setMessage'; readonly message: string }
  | { readonly type: 'start' }
  | { readonly type: 'pause' }
  | { readonly type: 'resume' }
  | { readonly type: 'reset' }
  | { readonly type: 'expire' };

export function isTimerDuration(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_TIMER_DURATION;
}

export function isCountdownMessage(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length >= 1 &&
    value.trim().length <= MAX_COUNTDOWN_MESSAGE_LENGTH
  );
}

export function timerRemainingMs(timer: TimerState, now: number): number {
  switch (timer.status) {
    case 'idle':
      return timer.durationSeconds * 1000;
    case 'running':
      return Math.max(0, timer.targetAt - now);
    case 'paused':
      return timer.remainingMs;
    case 'expired':
      return 0;
  }
}

export function reduceTimer(timer: TimerState, command: TimerCommand, now: number): TimerState {
  const { durationSeconds, message } = timer;
  if (timer.status === 'running' && timer.targetAt <= now) {
    timer = { durationSeconds, message, status: 'expired' };
  }

  switch (command.type) {
    case 'setDuration':
      if (!isTimerDuration(command.durationSeconds))
        throw new RangeError('Choose a duration from 0:01 to 99:59.');
      if (timer.status === 'running')
        throw new RangeError('Pause or reset the countdown before changing its duration.');
      return command.durationSeconds === durationSeconds
        ? timer
        : { message, durationSeconds: command.durationSeconds, status: 'idle' };
    case 'setMessage':
      if (!isCountdownMessage(command.message))
        throw new RangeError('Enter a countdown message between 1 and 80 characters.');
      return message === command.message.trim() ? timer : { ...timer, message: command.message.trim() };
    case 'start':
      return timer.status === 'idle' || timer.status === 'expired'
        ? { durationSeconds, message, status: 'running', targetAt: now + durationSeconds * 1000 }
        : timer;
    case 'pause':
      return timer.status === 'running'
        ? { durationSeconds, message, status: 'paused', remainingMs: timer.targetAt - now }
        : timer;
    case 'resume':
      return timer.status === 'paused'
        ? { durationSeconds, message, status: 'running', targetAt: now + timer.remainingMs }
        : timer;
    case 'reset':
      return timer.status === 'idle' ? timer : { durationSeconds, message, status: 'idle' };
    case 'expire':
      return timer;
  }
}
