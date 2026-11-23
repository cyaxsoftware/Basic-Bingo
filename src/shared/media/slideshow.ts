import { z } from 'zod';
import { isValidMediaId, type MediaItem } from './media';

export const MAX_COLLECTION_NAME = 60;
export const DEFAULT_SLIDE_SECONDS = 10;
export const MAX_SLIDE_SECONDS = 300;

export const collectionName = z.string().trim().min(1).max(MAX_COLLECTION_NAME);
export const slideSeconds = z.number().int().min(1).max(MAX_SLIDE_SECONDS);
export const slideshowFit = z.enum(['fit', 'fill']);
const mediaId = z.string().refine(isValidMediaId);
const collectionId = mediaId;
const slideKey = { collectionId, mediaId };

export type SlideshowFit = z.infer<typeof slideshowFit>;
export interface SlideshowSlide {
  readonly mediaId: string;
  readonly fit: SlideshowFit | null;
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
}

export const EMPTY_SLIDESHOW: SlideshowState = Object.freeze({
  collections: Object.freeze([]),
  activeId: null,
});

const slideshowCommandSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('create'), name: collectionName }),
  z.strictObject({ type: z.literal('rename'), collectionId, name: collectionName }),
  z.strictObject({ type: z.literal('delete'), collectionId }),
  z.strictObject({ type: z.literal('select'), collectionId: collectionId.nullable() }),
  z.strictObject({ type: z.literal('setInterval'), collectionId, secondsPerSlide: slideSeconds }),
  z.strictObject({ type: z.literal('setFit'), collectionId, fit: slideshowFit }),
  z.strictObject({ type: z.literal('addSlide'), ...slideKey }),
  z.strictObject({ type: z.literal('removeSlide'), ...slideKey }),
  z.strictObject({ type: z.literal('moveSlide'), ...slideKey, direction: z.enum(['up', 'down']) }),
  z.strictObject({ type: z.literal('setSlideFit'), ...slideKey, fit: slideshowFit.nullable() }),
]);

export type SlideshowCommand = z.infer<typeof slideshowCommandSchema>;

export function reduceSlideshow(
  state: SlideshowState,
  input: unknown,
  context: { readonly library: readonly MediaItem[]; readonly newId: () => string },
): SlideshowState {
  const parsed = slideshowCommandSchema.safeParse(input);
  if (!parsed.success) throw new RangeError('Invalid slideshow command or settings.');
  const command = parsed.data;
  const { collections, activeId } = state;

  if (command.type === 'create') {
    const id = context.newId();
    if (!isValidMediaId(id) || collections.some((entry) => entry.id === id)) {
      throw new RangeError('Could not assign a unique slideshow collection id.');
    }
    return {
      collections: [
        ...collections,
        { id, name: command.name, secondsPerSlide: DEFAULT_SLIDE_SECONDS, fit: 'fit', slides: [] },
      ],
      activeId: activeId ?? id,
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
      collections: collections.filter((entry) => entry !== collection),
      activeId: activeId === collection.id ? null : activeId,
    };
  }

  const next = editCollection(collection, command, context.library);
  return next === collection
    ? state
    : { ...state, collections: collections.map((entry) => (entry === collection ? next : entry)) };
}

function editCollection(
  collection: SlideshowCollection,
  command: Exclude<SlideshowCommand, { type: 'create' | 'select' | 'delete' }>,
  library: readonly MediaItem[],
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
  if (command.type === 'addSlide') {
    if (!library.some((image) => image.id === command.mediaId))
      throw new RangeError('That image is not in the library.');
    return index >= 0
      ? collection
      : { ...collection, slides: [...slides, { mediaId: command.mediaId, fit: null }] };
  }
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
