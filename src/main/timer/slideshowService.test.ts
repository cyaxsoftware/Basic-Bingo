import { afterEach, expect, it, vi } from 'vitest';
import { createDefaultAppData, type PersistedState } from '../persistence/persistedState';
import { AppStore } from '../state/appStore';
import { startSlideshowService, startTimerService } from './timerService';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const collectionId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

afterEach(() => vi.useRealTimers());

it('expires the shared countdown independently and never persists slide advances', () => {
  vi.useFakeTimers();
  vi.setSystemTime(100_000);
  const defaults = createDefaultAppData();
  const save = vi.fn(async (_state: PersistedState) => undefined);
  const store = new AppStore({
    initialData: {
      ...defaults,
      presentation: { mode: 'slideshow' },
      timer: { ...defaults.timer, durationSeconds: 3 },
      slideshow: {
        activeId: collectionId,
        collections: [
          {
            id: collectionId,
            name: 'Sponsors',
            fit: 'fit',
            secondsPerSlide: 2,
            slides: [
              { mediaId: A, fit: null },
              { mediaId: B, fit: null },
            ],
          },
        ],
      },
    },
    persister: { save },
  });
  const stopPlayback = startSlideshowService(store);
  const stopCountdown = startTimerService(store);
  store.dispatchTimer({ type: 'start' });
  store.dispatchSlideshowPlayback({ type: 'start' });
  expect(store.getSnapshot().slideshowPlayback).toMatchObject({ mediaId: A });
  vi.advanceTimersByTime(1999);
  expect(store.getSnapshot().slideshowPlayback).toMatchObject({ mediaId: A });
  vi.advanceTimersByTime(1);
  expect(store.getSnapshot().slideshowPlayback).toMatchObject({ mediaId: B });
  store.dispatchSlideshowPlayback({ type: 'hold', mediaId: B });
  vi.advanceTimersByTime(4000);
  expect(store.getSnapshot().timer.status).toBe('expired');
  expect(store.getSnapshot().slideshowPlayback).toEqual({ status: 'held', mediaId: B });
  store.dispatchSlideshowPlayback({ type: 'continue' });
  vi.advanceTimersByTime(1999);
  expect(store.getSnapshot().slideshowPlayback).toMatchObject({ mediaId: B });
  vi.advanceTimersByTime(1);
  expect(store.getSnapshot().slideshowPlayback).toMatchObject({ mediaId: A });
  expect(store.getSnapshot().timer.status).toBe('expired');
  expect(save).toHaveBeenCalledTimes(2);
  expect(save.mock.lastCall?.[0]).not.toHaveProperty('slideshowPlayback');
  store.setPresentationMode('gameBoard');
  vi.advanceTimersByTime(3000);
  expect(store.getSnapshot().slideshowPlayback).toEqual({ status: 'stopped', mediaId: A });
  expect(vi.getTimerCount()).toBe(0);
  stopPlayback();
  stopCountdown();
});
