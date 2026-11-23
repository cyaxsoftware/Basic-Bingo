import type { AppStore } from '../state/appStore';

export interface TimerClock {
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

/** Follow one snapshot deadline and cancel obsolete work when the authoritative state changes. */
function watchDeadline(
  store: AppStore,
  getTarget: () => number | null,
  onDeadline: (deadline: number) => void,
  clock: TimerClock,
): () => void {
  let target: number | null = null;
  let cancel: (() => void) | undefined;

  function waitForDeadline() {
    const deadline = target;
    if (deadline === null) return;
    // Node would turn a delay beyond its signed 32-bit limit into a one-millisecond timeout.
    const delay = Math.min(2_147_483_647, Math.max(0, deadline - clock.now()));
    cancel = clock.schedule(() => {
      if (target !== deadline) return;
      if (clock.now() >= deadline) onDeadline(deadline);
      if (target === deadline) waitForDeadline();
    }, delay);
  }

  const sync = () => {
    const nextTarget = getTarget();
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

export function startTimerService(store: AppStore, clock: TimerClock = systemClock): () => void {
  return watchDeadline(
    store,
    () => {
      const { timer } = store.getSnapshot();
      return timer.status === 'running' ? timer.targetAt : null;
    },
    () => store.dispatchTimer({ type: 'expire' }),
    clock,
  );
}

export function startSlideshowService(store: AppStore, clock: TimerClock = systemClock): () => void {
  return watchDeadline(
    store,
    () => {
      const { slideshowPlayback } = store.getSnapshot();
      return slideshowPlayback.status === 'playing' ? slideshowPlayback.advanceAt : null;
    },
    (deadline) => store.advanceSlideshow(deadline),
    clock,
  );
}
