import type { AppStore } from '../state/appStore';

interface TimerClock {
  now(): number;
  schedule(callback: () => void, delayMs: number): () => void;
}

const systemClock: TimerClock = {
  now: () => Date.now(),
  schedule(callback, delayMs) {
    const handle = setTimeout(callback, delayMs);
    return () => clearTimeout(handle);
  },
};

/** Schedule one deadline. The clock is checked again when it fires in case system time shifted. */
export function startTimerService(store: AppStore, clock: TimerClock = systemClock): () => void {
  let target: number | null = null;
  let cancel: (() => void) | undefined;

  function waitForDeadline() {
    const deadline = target;
    if (deadline === null) return;
    // Node would turn a delay beyond its signed 32-bit limit into a one-millisecond timeout.
    const delay = Math.min(2_147_483_647, Math.max(0, deadline - clock.now()));
    cancel = clock.schedule(() => {
      if (target !== deadline) return;
      if (clock.now() >= deadline) store.dispatchTimer({ type: 'expire' });
      if (target === deadline) waitForDeadline();
    }, delay);
  }

  const sync = () => {
    const { timer } = store.getSnapshot();
    const nextTarget = timer.status === 'running' ? timer.targetAt : null;
    if (target === nextTarget) return;
    cancel?.();
    target = nextTarget;
    waitForDeadline();
  };

  const unsubscribe = store.subscribe(sync);
  sync();
  return () => {
    unsubscribe();
    target = null;
    cancel?.();
  };
}
