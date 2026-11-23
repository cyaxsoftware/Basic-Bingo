import { describe, expect, it } from 'vitest';
import type { MediaItem } from './media';
import {
  DEFAULT_SLIDE_SECONDS,
  EMPTY_SLIDESHOW,
  appendSlideshowImages,
  showsSlideshowCountdown,
  reduceSlideshow,
  removeImageFromSlideshows,
  type SlideshowCommand,
} from './slideshow';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const FIRST = '11111111-1111-4111-8111-111111111111';
const SECOND = '22222222-2222-4222-8222-222222222222';
const library: MediaItem[] = [A, B].map((id) => ({
  id,
  name: 'Sponsor.png',
  format: 'png',
  bytes: 100,
  width: 10,
  height: 10,
  addedAt: '',
  fit: 'original',
}));

function setup() {
  let state = EMPTY_SLIDESHOW;
  let nextId = FIRST;
  const send = (command: unknown) => (state = reduceSlideshow(state, command, () => nextId));
  const add = (collectionId: string, images: readonly MediaItem[] = library) =>
    (state = appendSlideshowImages(state, collectionId, images, []));
  send({ type: 'create', name: ' Sponsors ' });
  nextId = SECOND;
  return { send, add, current: () => state };
}

describe('slideshow collections', () => {
  it('shows the countdown by default and remembers visibility independently of collections', () => {
    const { send, current } = setup();
    const initial = current();
    expect(showsSlideshowCountdown(initial)).toBe(true);
    expect(send({ type: 'setCountdownVisible', visible: true })).toBe(initial);
    const hidden = send({ type: 'setCountdownVisible', visible: false });
    expect(hidden.collections).toBe(initial.collections);
    expect(showsSlideshowCountdown(hidden)).toBe(false);
    expect(showsSlideshowCountdown(send({ type: 'create', name: 'Events' }))).toBe(false);
    expect(showsSlideshowCountdown(send({ type: 'delete', collectionId: SECOND }))).toBe(false);
    expect(() => send({ type: 'setCountdownVisible', visible: 'false' })).toThrow(RangeError);
    expect(showsSlideshowCountdown(send({ type: 'setCountdownVisible', visible: true }))).toBe(true);
  });

  it('creates, renames, selects and deletes collections by id', () => {
    const { send, current } = setup();
    expect(current()).toEqual({
      activeId: FIRST,
      collections: [
        { id: FIRST, name: 'Sponsors', secondsPerSlide: DEFAULT_SLIDE_SECONDS, fit: 'fit', slides: [] },
      ],
    });
    expect(send({ type: 'create', name: 'Events' }).activeId).toBe(SECOND);
    expect(send({ type: 'rename', collectionId: SECOND, name: 'Announcements' }).collections[1]?.name).toBe(
      'Announcements',
    );
    expect(send({ type: 'select', collectionId: FIRST }).activeId).toBe(FIRST);
    expect(send({ type: 'select', collectionId: SECOND }).activeId).toBe(SECOND);
    expect(send({ type: 'delete', collectionId: FIRST }).activeId).toBe(SECOND);
    expect(send({ type: 'delete', collectionId: SECOND })).toEqual(EMPTY_SLIDESHOW);
    expect(send({ type: 'select', collectionId: null })).toBe(current());
  });

  it('appends, moves and removes owned images in order and saves fit overrides separately', () => {
    const { send, add } = setup();
    const apply = (command: SlideshowCommand) => send(command).collections[0];
    apply({ type: 'setInterval', collectionId: FIRST, secondsPerSlide: 25 });
    apply({ type: 'setFit', collectionId: FIRST, fit: 'fill' });
    add(FIRST);
    expect(
      apply({ type: 'moveSlide', collectionId: FIRST, mediaId: A, direction: 'down' })?.slides.map(
        (slide) => slide.mediaId,
      ),
    ).toEqual([B, A]);
    expect(
      apply({ type: 'moveSlide', collectionId: FIRST, mediaId: A, direction: 'up' })?.slides.map(
        (slide) => slide.mediaId,
      ),
    ).toEqual([A, B]);
    const withOverride = apply({ type: 'setSlideFit', collectionId: FIRST, mediaId: B, fit: 'original' });
    expect(withOverride).toMatchObject({
      fit: 'fill',
      secondsPerSlide: 25,
      slides: [
        { mediaId: A, fit: null },
        { mediaId: B, fit: 'original' },
      ],
    });
    expect(
      apply({ type: 'setSlideFit', collectionId: FIRST, mediaId: B, fit: null })?.slides[1]?.fit,
    ).toBeNull();
    expect(apply({ type: 'removeSlide', collectionId: FIRST, mediaId: A })?.slides).toEqual([
      { mediaId: B, fit: null, image: library[1] },
    ]);
  });

  it('keeps identity for repeated choices and moves at the edge', () => {
    const { send, add } = setup();
    const state = add(FIRST);
    expect(add(FIRST, [])).toBe(state);
    expect(send({ type: 'moveSlide', collectionId: FIRST, mediaId: A, direction: 'up' })).toBe(state);
    expect(send({ type: 'select', collectionId: FIRST })).toBe(state);
    expect(send({ type: 'setFit', collectionId: FIRST, fit: 'fit' })).toBe(state);
  });

  it.each([
    { type: 'create', name: '   ' },
    { type: 'rename', collectionId: FIRST, name: 'x'.repeat(61) },
    { type: 'select', collectionId: SECOND },
    { type: 'setInterval', collectionId: FIRST, secondsPerSlide: 301 },
    { type: 'setInterval', collectionId: FIRST, secondsPerSlide: 1.5 },
    { type: 'setFit', collectionId: FIRST, fit: 'original' },
    { type: 'addSlide', collectionId: FIRST, mediaId: SECOND },
    { type: 'removeSlide', collectionId: FIRST, mediaId: A },
    { type: 'moveSlide', collectionId: FIRST, mediaId: A, direction: 1 },
    { type: 'setSlideFit', collectionId: FIRST, mediaId: A, fit: 'fit' },
  ])('rejects invalid arguments or unknown references for $type', (command) => {
    const { send, current } = setup();
    const before = current();
    expect(() => send(command)).toThrow(RangeError);
    expect(current()).toBe(before);
  });

  it('rejects duplicate imports or a missing destination without mutating the state', () => {
    const { add, current } = setup();
    expect(() => appendSlideshowImages(current(), FIRST, library, library)).toThrow(RangeError);
    expect(() => add(SECOND)).toThrow(RangeError);
    const added = add(FIRST);
    expect(() => add(FIRST)).toThrow(RangeError);
    expect(current()).toBe(added);
  });

  it('clears a removed legacy library image from every collection, keeping remaining order', () => {
    const { send, current } = setup();
    send({ type: 'create', name: 'Events' });
    const state = current();
    const cleaned = removeImageFromSlideshows(
      {
        ...state,
        collections: state.collections.map((entry) => ({
          ...entry,
          slides: [
            { mediaId: B, fit: null },
            { mediaId: A, fit: null },
          ],
        })),
      },
      B,
    );
    expect(cleaned.activeId).toBe(SECOND);
    expect(cleaned.collections.map(({ slides }) => slides.map(({ mediaId }) => mediaId))).toEqual([[A], [A]]);
    expect(removeImageFromSlideshows(cleaned, B)).toBe(cleaned);
  });
});
