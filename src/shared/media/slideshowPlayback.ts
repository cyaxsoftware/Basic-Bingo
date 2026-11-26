import { z } from 'zod';
import { isValidMediaId } from './media';
import type { SlideshowCollection, SlideshowSlide, SlideshowState } from './slideshow';

export type SlideshowPlayback =
  | { readonly status: 'stopped'; readonly mediaId: string | null }
  | { readonly status: 'held'; readonly mediaId: string }
  | { readonly status: 'playing'; readonly mediaId: string; readonly advanceAt: number };

export const STOPPED_SLIDESHOW: SlideshowPlayback = Object.freeze({ status: 'stopped', mediaId: null });

export function stopSlideshow(playback: SlideshowPlayback): SlideshowPlayback {
  return playback.status === 'stopped' ? playback : { status: 'stopped', mediaId: playback.mediaId };
}

/** Checks a playback command from a renderer (untrusted input). */
export const slideshowPlaybackCommandSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('start') }),
  z.strictObject({ type: z.literal('stop') }),
  z.strictObject({ type: z.literal('continue') }),
  z.strictObject({ type: z.literal('hold'), mediaId: z.string().refine(isValidMediaId) }),
]);
export type SlideshowPlaybackCommand = z.infer<typeof slideshowPlaybackCommandSchema>;

export function activeSlideshow(state: SlideshowState): SlideshowCollection | undefined {
  return state.collections.find(({ id }) => id === state.activeId);
}

export function presentedSlide(
  collection: SlideshowCollection | undefined,
  playback: SlideshowPlayback,
): SlideshowSlide | undefined {
  return collection?.slides.find(({ mediaId }) => mediaId === playback.mediaId) ?? collection?.slides[0];
}

function playSlide(mediaId: string, collection: SlideshowCollection, now: number): SlideshowPlayback {
  return { status: 'playing', mediaId, advanceAt: now + collection.secondsPerSlide * 1000 };
}

export function reduceSlideshowPlayback(
  playback: SlideshowPlayback,
  collection: SlideshowCollection | undefined,
  input: unknown,
  now: number,
): SlideshowPlayback {
  const parsed = slideshowPlaybackCommandSchema.safeParse(input);
  if (!parsed.success) throw new RangeError('Invalid slideshow playback command.');
  const command = parsed.data;
  if (command.type === 'stop') {
    return stopSlideshow(playback);
  }
  const first = collection?.slides[0];
  if (!collection || !first) throw new RangeError('Add images to the active collection to play a slideshow.');
  switch (command.type) {
    case 'start':
      return playback.status === 'stopped' ? playSlide(first.mediaId, collection, now) : playback;
    case 'hold':
      if (!collection.slides.some(({ mediaId }) => mediaId === command.mediaId)) {
        throw new RangeError('That image is not in the active collection.');
      }
      return playback.status === 'held' && playback.mediaId === command.mediaId
        ? playback
        : { status: 'held', mediaId: command.mediaId };
    case 'continue':
      return playback.status === 'held' ? playSlide(playback.mediaId, collection, now) : playback;
  }
}

export function advanceSlideshow(
  playback: SlideshowPlayback,
  collection: SlideshowCollection | undefined,
  deadline: number,
  now: number,
): SlideshowPlayback {
  if (playback.status !== 'playing' || playback.advanceAt !== deadline || now < deadline) return playback;
  if (!collection || collection.slides.length === 0) return STOPPED_SLIDESHOW;
  const index = collection.slides.findIndex(({ mediaId }) => mediaId === playback.mediaId);
  const next = collection.slides[(index + 1) % collection.slides.length];
  // After sleep or a busy event loop, give the next slide its full viewing interval.
  return next ? playSlide(next.mediaId, collection, now) : STOPPED_SLIDESHOW;
}

export function reconcileSlideshowPlayback(
  playback: SlideshowPlayback,
  before: SlideshowState,
  after: SlideshowState,
  now: number,
): SlideshowPlayback {
  if (before.activeId !== after.activeId) return STOPPED_SLIDESHOW;
  if (playback.mediaId === null) return playback;
  const collection = activeSlideshow(after);
  if (!collection?.slides.some(({ mediaId }) => mediaId === playback.mediaId)) return STOPPED_SLIDESHOW;
  if (
    playback.status === 'playing' &&
    activeSlideshow(before)?.secondsPerSlide !== collection.secondsPerSlide
  ) {
    return playSlide(playback.mediaId, collection, now);
  }
  return playback;
}
