import { useEffect, useState } from 'react';
import { timerRemainingMs, type TimerState } from '../../shared/timer/timerState';

export function formatCountdown(remainingMs: number): string {
  // Keep the last second visible right up to the deadline.
  const seconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function useCountdown(timer: TimerState) {
  const [now, setNow] = useState(Date.now);
  const targetAt = timer.status === 'running' ? timer.targetAt : null;
  useEffect(() => {
    if (targetAt === null) return;
    const tick = () => setNow(Date.now());
    tick();
    const interval = window.setInterval(tick, 250);
    return () => window.clearInterval(interval);
  }, [targetAt]);

  const remainingMs = timerRemainingMs(timer, now);
  return {
    time: formatCountdown(remainingMs),
    status: remainingMs === 0 ? ('expired' as const) : timer.status,
  };
}
