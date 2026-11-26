import { z } from 'zod';
import { isMediaItem, isValidMediaId, type FitMode, type MediaItem } from './media';

export const MAX_COLLECTION_NAME = 60;
export const DEFAULT_SLIDE_SECONDS = 10;
export const MAX_SLIDE_SECONDS = 300;

export const collectionName = z.string().trim().min(1).max(MAX_COLLECTION_NAME);
export const slideSeconds = z.number().int().min(1).max(MAX_SLIDE_SECONDS);
export const slideshowFit = z.enum(['fit', 'fill']);
export const slideFit = z.enum(['original', 'fit', 'fill']).nullable();
const mediaId = z.string().refine(isValidMediaId);
const collectionIdSchema = mediaId;
const slideKey = { collectionId: collectionIdSchema, mediaId };

export type SlideshowFit = z.infer<typeof slideshowFit>;
export interface SlideshowSlide {
  readonly mediaId: string;
  readonly fit: FitMode | null;
  /** Older collections can still reference Single Image gallery entries by ID. */
  readonly image?: MediaItem;
}

export interface SlideshowCollection {
  readonly id: string;
  readonly name: string;
  readonly secondsPerSlide: number;
  readonly fit: SlideshowFit;
  readonly slides: readonly SlideshowSlide[];
}

export interface SlideshowState {
  readonly collections: readonly SlideshowCollection[];
  readonly activeId: string | null;
  /** Older saves show the countdown by default. */
  readonly showCountdown?: boolean;
}

export function showsSlideshowCountdown(state: SlideshowState): boolean {
  return state.showCountdown !== false;
}

export const EMPTY_SLIDESHOW: SlideshowState = Object.freeze({
  collections: Object.freeze([]),
  activeId: null,
});

/** Checks a slideshow edit from a renderer (untrusted input). */
export const slideshowCommandSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('create'), name: collectionName }),
  z.strictObject({ type: z.literal('rename'), collectionId: collectionIdSchema, name: collectionName }),
  z.strictObject({ type: z.literal('delete'), collectionId: collectionIdSchema }),
  z.strictObject({ type: z.literal('select'), collectionId: collectionIdSchema.nullable() }),
  z.strictObject({ type: z.literal('setCountdownVisible'), visible: z.boolean() }),
  z.strictObject({
    type: z.literal('setInterval'),
    collectionId: collectionIdSchema,
    secondsPerSlide: slideSeconds,
  }),
  z.strictObject({ type: z.literal('setFit'), collectionId: collectionIdSchema, fit: slideshowFit }),
  z.strictObject({ type: z.literal('removeSlide'), ...slideKey }),
  z.strictObject({ type: z.literal('moveSlide'), ...slideKey, direction: z.enum(['up', 'down']) }),
  z.strictObject({ type: z.literal('setSlideFit'), ...slideKey, fit: slideFit }),
]);

export type SlideshowCommand = z.infer<typeof slideshowCommandSchema>;

export function reduceSlideshow(state: SlideshowState, input: unknown, newId: () => string): SlideshowState {
  const parsed = slideshowCommandSchema.safeParse(input);
  if (!parsed.success) throw new RangeError('Invalid slideshow command or settings.');
  const command = parsed.data;
  const { collections, activeId } = state;

  if (command.type === 'setCountdownVisible') {
    return showsSlideshowCountdown(state) === command.visible
      ? state
      : { ...state, showCountdown: command.visible };
  }
  if (command.type === 'create') {
    const id = newId();
    if (!isValidMediaId(id) || collections.some((entry) => entry.id === id)) {
      throw new RangeError('Could not assign a unique slideshow collection id.');
    }
    return {
      ...state,
      collections: [
        ...collections,
        { id, name: command.name, secondsPerSlide: DEFAULT_SLIDE_SECONDS, fit: 'fit', slides: [] },
      ],
      activeId: id,
    };
  }
  if (command.type === 'select' && command.collectionId === null) {
    return activeId === null ? state : { ...state, activeId: null };
  }

  const collection = collections.find((entry) => entry.id === command.collectionId);
  if (!collection) throw new RangeError('That slideshow collection no longer exists.');
  if (command.type === 'select')
    return activeId === collection.id ? state : { ...state, activeId: collection.id };
  if (command.type === 'delete') {
    return {
      ...state,
      collections: collections.filter((entry) => entry !== collection),
      activeId: activeId === collection.id ? null : activeId,
    };
  }

  const next = editCollection(collection, command);
  return next === collection
    ? state
    : { ...state, collections: collections.map((entry) => (entry === collection ? next : entry)) };
}

function editCollection(
  collection: SlideshowCollection,
  command: Exclude<SlideshowCommand, { type: 'create' | 'select' | 'delete' | 'setCountdownVisible' }>,
): SlideshowCollection {
  switch (command.type) {
    case 'rename':
      return collection.name === command.name ? collection : { ...collection, name: command.name };
    case 'setInterval':
      return collection.secondsPerSlide === command.secondsPerSlide
        ? collection
        : { ...collection, secondsPerSlide: command.secondsPerSlide };
    case 'setFit':
      return collection.fit === command.fit ? collection : { ...collection, fit: command.fit };
  }

  const { slides } = collection;
  const index = slides.findIndex((slide) => slide.mediaId === command.mediaId);
  const slide = slides[index];
  if (!slide) throw new RangeError('That image is not in the collection.');
  switch (command.type) {
    case 'removeSlide':
      return { ...collection, slides: slides.filter((entry) => entry !== slide) };
    case 'setSlideFit':
      return slide.fit === command.fit
        ? collection
        : {
            ...collection,
            slides: slides.map((entry) => (entry === slide ? { ...slide, fit: command.fit } : entry)),
          };
    case 'moveSlide': {
      const destination = index + (command.direction === 'up' ? -1 : 1);
      const neighbor = slides[destination];
      if (!neighbor) return collection;
      const ordered = [...slides];
      ordered[index] = neighbor;
      ordered[destination] = slide;
      return { ...collection, slides: ordered };
    }
  }
}

export function slideshowImages(state: SlideshowState): readonly MediaItem[] {
  return state.collections.flatMap(({ slides }) => slides.flatMap(({ image }) => (image ? [image] : [])));
}

/** The file picker can complete after the operator switches collections or deletes its destination. */
export function appendSlideshowImages(
  state: SlideshowState,
  collectionId: string,
  images: readonly MediaItem[],
  library: readonly MediaItem[],
): SlideshowState {
  const collection = state.collections.find(({ id }) => id === collectionId);
  if (!collection) throw new RangeError('That slideshow collection no longer exists.');
  if (images.length === 0) return state;
  const usedIds = new Set([...library, ...slideshowImages(state)].map(({ id }) => id));
  const slides = images.map((image): SlideshowSlide => {
    if (!isMediaItem(image) || usedIds.has(image.id))
      throw new RangeError('Invalid or duplicate slideshow image.');
    usedIds.add(image.id);
    return { mediaId: image.id, fit: null, image };
  });
  return {
    ...state,
    collections: state.collections.map((entry) =>
      entry === collection ? { ...entry, slides: [...entry.slides, ...slides] } : entry,
    ),
  };
}

/** Removing a library image must remove its references in the same published snapshot and save. */
export function removeImageFromSlideshows(state: SlideshowState, id: string): SlideshowState {
  if (!state.collections.some((entry) => entry.slides.some((slide) => slide.mediaId === id))) return state;
  return {
    ...state,
    collections: state.collections.map((entry) => {
      const slides = entry.slides.filter((slide) => slide.mediaId !== id);
      return slides.length === entry.slides.length ? entry : { ...entry, slides };
    }),
  };
}
