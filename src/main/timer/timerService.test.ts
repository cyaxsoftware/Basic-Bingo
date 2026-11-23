import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_TIMER, type TimerState } from '../../shared/timer/timerState';
import { createDefaultAppData } from '../persistence/persistedState';
import { AppStore } from '../state/appStore';
import { startTimerService } from './timerService';

const startAt = 100_000;

function setup(timer: TimerState = { ...DEFAULT_TIMER, durationSeconds: 2 }) {
  const save = vi.fn(async () => undefined);
  const store = new AppStore({ initialData: { ...createDefaultAppData(), timer }, persister: { save } });
  const publish = vi.fn();
  store.subscribe(publish);
  const schedule = vi.fn((callback: () => void, delayMs: number) => {
    const handle = setTimeout(callback, delayMs);
    return () => clearTimeout(handle);
  });
  const stop = startTimerService(store, { now: () => Date.now(), schedule });
  return { store, publish, save, schedule, stop };
}

describe('timer service', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(startAt);
  });
  afterEach(() => vi.useRealTimers());

  it('publishes and saves expiry exactly at a restored deadline, with no intermediate ticks', () => {
    const timer = { ...DEFAULT_TIMER, status: 'running', targetAt: startAt + 2000 } as const;
    const { store, publish, save, schedule } = setup(timer);
    vi.advanceTimersByTime(1999);
    expect(store.getSnapshot().timer).toBe(timer);
    expect(publish).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(store.getSnapshot().timer).toEqual({ ...DEFAULT_TIMER, status: 'expired' });
    expect(publish).toHaveBeenCalledExactlyOnceWith(store.getSnapshot());
    expect(save).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ timer: store.getSnapshot().timer }),
    );
    expect(schedule).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels the old deadline on pause and uses the precise resumed deadline across mode changes', () => {
    const { store, schedule } = setup();
    store.dispatchTimer({ type: 'start' });
    vi.advanceTimersByTime(437);
    store.dispatchTimer({ type: 'pause' });
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(5000);
    expect(store.getSnapshot().timer).toMatchObject({ status: 'paused', remainingMs: 1563 });
    store.dispatchTimer({ type: 'resume' });
    store.setPresentationMode('singleImage');
    store.dispatchTimer({ type: 'setMessage', message: 'Coming up' });
    expect(schedule).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(1562);
    expect(store.getSnapshot().timer.status).toBe('running');
    vi.advanceTimersByTime(1);
    expect(store.getSnapshot().timer.status).toBe('expired');
  });

  it('cancels work on reset or service shutdown', () => {
    const { store, stop, schedule } = setup();
    store.dispatchTimer({ type: 'start' });
    store.dispatchTimer({ type: 'reset' });
    expect(vi.getTimerCount()).toBe(0);
    store.dispatchTimer({ type: 'start' });
    stop();
    vi.advanceTimersByTime(2000);
    expect(store.getSnapshot().timer.status).toBe('running');
    store.dispatchTimer({ type: 'start' });
    expect(schedule).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });
});
