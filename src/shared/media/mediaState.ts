/**
 * The media library and the Single Image choice, and the commands that change them.
 *
 * The same shape as the pattern and game reducers: the main process runs it, renderers only send commands and
 * read snapshots. Importing an image is done by the main process (it reads the file and builds the entry), so
 * `addMedia` is an internal command that no renderer can send; the Controller can only choose, set Fit / Fill
 * and remove. Returns the SAME object when a command changes nothing. Invalid arguments throw RangeError.
 */
import { isFitMode, isMediaItem, isValidMediaId, type FitMode, type MediaItem } from './media';

/** What the Single Image mode shows. */
export interface SingleImageState {
  /** The chosen library image, or null when none is chosen. How it fits the screen is the image's own `fit`. */
  readonly imageId: string | null;
}

export interface MediaState {
  readonly library: readonly MediaItem[];
  readonly singleImage: SingleImageState;
}

export const INITIAL_MEDIA_STATE: MediaState = Object.freeze({
  library: Object.freeze([]) as readonly MediaItem[],
  singleImage: Object.freeze({ imageId: null }),
});

export type MediaCommand =
  /** Internal: main adds what it has just imported. */
  | { readonly type: 'addMedia'; readonly items: readonly MediaItem[] }
  | { readonly type: 'removeMedia'; readonly mediaId: string }
  | { readonly type: 'selectSingleImage'; readonly mediaId: string | null }
  /** Set how one image meets the screen (each image keeps its own). */
  | { readonly type: 'setImageFit'; readonly mediaId: string; readonly fit: FitMode };

export type MediaCommandType = MediaCommand['type'];

export function findMedia(library: readonly MediaItem[], id: string): MediaItem | undefined {
  return library.find((item) => item.id === id);
}

export function reduceMedia(state: MediaState, command: MediaCommand): MediaState {
  const { library, singleImage } = state;
  switch (command.type) {
    case 'addMedia': {
      if (!Array.isArray(command.items)) throw new RangeError('Expected a list of images to add.');
      if (command.items.length === 0) return state;
      const ids = new Set(library.map((item) => item.id));
      for (const item of command.items) {
        if (!isMediaItem(item)) throw new RangeError('That is not a valid image entry.');
        if (ids.has(item.id))
          throw new RangeError(`An image with id "${item.id}" is already in the library.`);
        ids.add(item.id);
      }
      return { ...state, library: [...library, ...command.items] };
    }
    case 'removeMedia': {
      if (!findMedia(library, command.mediaId)) throw new RangeError('That image is not in the library.');
      return {
        library: library.filter((item) => item.id !== command.mediaId),
        // Taking the chosen image away leaves nothing chosen (the projector then shows its "no image" screen).
        singleImage: singleImage.imageId === command.mediaId ? { imageId: null } : singleImage,
      };
    }
    case 'selectSingleImage': {
      if (command.mediaId !== null) {
        if (!isValidMediaId(command.mediaId) || !findMedia(library, command.mediaId)) {
          throw new RangeError('That image is not in the library.');
        }
      }
      return singleImage.imageId === command.mediaId
        ? state
        : { ...state, singleImage: { imageId: command.mediaId } };
    }
    case 'setImageFit': {
      if (!isFitMode(command.fit)) throw new RangeError('Fit mode must be "fit", "fill" or "original".');
      const item = findMedia(library, command.mediaId);
      if (!item) throw new RangeError('That image is not in the library.');
      if (item.fit === command.fit) return state;
      return {
        ...state,
        library: library.map((entry) =>
          entry.id === command.mediaId ? { ...entry, fit: command.fit } : entry,
        ),
      };
    }
    default: {
      // Compile-time exhaustiveness check; at runtime `command` can still be anything.
      const unknownCommand: never = command;
      throw new Error(`Unhandled media command: ${String((unknownCommand as { type?: unknown }).type)}`);
    }
  }
}
