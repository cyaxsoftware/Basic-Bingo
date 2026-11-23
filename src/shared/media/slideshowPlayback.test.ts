import { describe, expect, it } from 'vitest';
import type { SlideshowCollection, SlideshowState } from './slideshow';
import {
  advanceSlideshow,
  presentedSlide,
  reconcileSlideshowPlayback,
  reduceSlideshowPlayback,
  STOPPED_SLIDESHOW,
} from './slideshowPlayback';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const collection: SlideshowCollection = {
  id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  name: 'Sponsors',
  secondsPerSlide: 3,
  fit: 'fit',
  slides: [A, B, C].map((mediaId) => ({ mediaId, fit: null })),
};
const saved: SlideshowState = { activeId: collection.id, collections: [collection] };

describe('slideshow playback', () => {
  it('starts at the first slide, advances only at the deadline, and loops', () => {
    const first = reduceSlideshowPlayback(STOPPED_SLIDESHOW, collection, { type: 'start' }, 100);
    expect(first).toEqual({ status: 'playing', mediaId: A, advanceAt: 3100 });
    expect(advanceSlideshow(first, collection, 3100, 3099)).toBe(first);
    const second = advanceSlideshow(first, collection, 3100, 3100);
    expect(second).toEqual({ status: 'playing', mediaId: B, advanceAt: 6100 });
    const third = advanceSlideshow(second, collection, 6100, 6500);
    expect(third).toEqual({ status: 'playing', mediaId: C, advanceAt: 9500 });
    expect(advanceSlideshow(third, collection, 9500, 9500)).toEqual({
      status: 'playing',
      mediaId: A,
      advanceAt: 12_500,
    });
  });

  it('holds the selected slide and continues with a fresh interval before advancing', () => {
    const first = reduceSlideshowPlayback(STOPPED_SLIDESHOW, collection, { type: 'start' }, 100);
    const held = reduceSlideshowPlayback(first, collection, { type: 'hold', mediaId: B }, 3000);
    expect(held).toEqual({ status: 'held', mediaId: B });
    expect(advanceSlideshow(held, collection, 3100, 3100)).toBe(held);
    const continued = reduceSlideshowPlayback(held, collection, { type: 'continue' }, 10_000);
    expect(continued).toEqual({ status: 'playing', mediaId: B, advanceAt: 13_000 });
    expect(advanceSlideshow(continued, collection, 3100, 12_999)).toBe(continued);
    expect(advanceSlideshow(continued, collection, 13_000, 13_000)).toMatchObject({ mediaId: C });
  });

  it('keeps the current slide on stop and starts from the beginning on the next Start', () => {
    const held = reduceSlideshowPlayback(STOPPED_SLIDESHOW, collection, { type: 'hold', mediaId: B }, 0);
    const stopped = reduceSlideshowPlayback(held, collection, { type: 'stop' }, 100);
    expect(stopped).toEqual({ status: 'stopped', mediaId: B });
    expect(presentedSlide(collection, stopped)?.mediaId).toBe(B);
    expect(reduceSlideshowPlayback(stopped, collection, { type: 'continue' }, 100)).toBe(stopped);
    expect(reduceSlideshowPlayback(stopped, collection, { type: 'start' }, 200)).toMatchObject({
      mediaId: A,
    });
  });

  it('reconciles settings changes without resetting playback on a rename or reorder', () => {
    const run = reduceSlideshowPlayback(STOPPED_SLIDESHOW, collection, { type: 'start' }, 100);
    const reordered = {
      ...saved,
      collections: [{ ...collection, name: 'Renamed', slides: collection.slides.toReversed() }],
    };
    expect(reconcileSlideshowPlayback(run, saved, reordered, 150)).toBe(run);
    const interval = { ...saved, collections: [{ ...collection, secondsPerSlide: 8 }] };
    expect(reconcileSlideshowPlayback(run, saved, interval, 200)).toEqual({
      status: 'playing',
      mediaId: A,
      advanceAt: 8200,
    });
    expect(reconcileSlideshowPlayback(run, saved, { ...saved, activeId: null }, 300)).toBe(STOPPED_SLIDESHOW);
    const removed = { ...saved, collections: [{ ...collection, slides: collection.slides.slice(1) }] };
    expect(reconcileSlideshowPlayback(run, saved, removed, 300)).toBe(STOPPED_SLIDESHOW);
    expect(presentedSlide(removed.collections[0], STOPPED_SLIDESHOW)?.mediaId).toBe(B);
  });

  it('validates commands and targets and refuses to play an empty collection', () => {
    expect(() =>
      reduceSlideshowPlayback(STOPPED_SLIDESHOW, collection, { type: 'hold', mediaId: collection.id }, 0),
    ).toThrow(RangeError);
    expect(() =>
      reduceSlideshowPlayback(STOPPED_SLIDESHOW, collection, { type: 'start', extra: true }, 0),
    ).toThrow(RangeError);
    expect(() =>
      reduceSlideshowPlayback(STOPPED_SLIDESHOW, { ...collection, slides: [] }, { type: 'start' }, 0),
    ).toThrow(RangeError);
  });
});
