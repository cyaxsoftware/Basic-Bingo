import { describe, expect, it } from 'vitest';
import {
  cleanMediaName,
  isMediaItem,
  isValidMediaId,
  MAX_IMAGE_BYTES,
  MAX_MEDIA_NAME_LENGTH,
  mediaFileName,
  mediaUrl,
  mimeTypeFor,
  type MediaItem,
} from './media';
import { INITIAL_MEDIA_STATE, reduceMedia, type MediaCommand, type MediaState } from './mediaState';

const ID_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ID_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function item(id: string, overrides: Partial<MediaItem> = {}): MediaItem {
  return {
    id,
    name: 'Sponsor.png',
    format: 'png',
    bytes: 1234,
    width: 800,
    height: 400,
    addedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const withImages = (...ids: string[]): MediaState => ({
  ...INITIAL_MEDIA_STATE,
  library: ids.map((id) => item(id)),
});

describe('media ids, file names and urls', () => {
  it('accepts only lowercase UUIDs as ids', () => {
    expect(isValidMediaId(ID_A)).toBe(true);
    for (const bad of [
      '',
      'abc',
      '../../etc/passwd',
      ID_A.toUpperCase(),
      `${ID_A}.png`,
      `${ID_A}/x`,
      7,
      null,
    ]) {
      expect(isValidMediaId(bad)).toBe(false);
    }
  });

  it('derives the file name from the id and format, so it can never be anything else', () => {
    expect(mediaFileName({ id: ID_A, format: 'png' })).toBe(`${ID_A}.png`);
    expect(mediaFileName({ id: ID_A, format: 'jpeg' })).toBe(`${ID_A}.jpg`);
    expect(mediaFileName({ id: ID_A, format: 'webp' })).toBe(`${ID_A}.webp`);
    expect(mediaFileName({ id: ID_A, format: 'gif' })).toBe(`${ID_A}.gif`);
  });

  it('maps every format to its mime type and builds the protocol url', () => {
    expect(mimeTypeFor('jpeg')).toBe('image/jpeg');
    expect(mimeTypeFor('png')).toBe('image/png');
    expect(mediaUrl(ID_A)).toBe(`bingo-media://${ID_A}`);
  });
});

describe('cleanMediaName', () => {
  it('keeps just the file name, never a folder', () => {
    expect(cleanMediaName('C:\\Users\\me\\Pictures\\Logo.png')).toBe('Logo.png');
    expect(cleanMediaName('/home/me/logo.png')).toBe('logo.png');
  });

  it('never returns an empty name, and caps a long one', () => {
    expect(cleanMediaName('')).toBe('Image');
    expect(cleanMediaName('   ')).toBe('Image');
    expect(cleanMediaName(null)).toBe('Image');
    expect(cleanMediaName('x'.repeat(500))).toHaveLength(MAX_MEDIA_NAME_LENGTH);
  });
});

describe('isMediaItem', () => {
  it('accepts a well-formed entry', () => {
    expect(isMediaItem(item(ID_A))).toBe(true);
  });

  it.each<[string, unknown]>([
    ['a bad id', item('nope')],
    ['an empty name', item(ID_A, { name: '' })],
    ['an unknown format', item(ID_A, { format: 'bmp' as never })],
    ['zero bytes', item(ID_A, { bytes: 0 })],
    ['too many bytes', item(ID_A, { bytes: MAX_IMAGE_BYTES + 1 })],
    ['a fractional width', item(ID_A, { width: 1.5 })],
    ['a missing height', { ...item(ID_A), height: undefined }],
    ['a missing date', { ...item(ID_A), addedAt: undefined }],
    ['not an object', 'x'],
    ['null', null],
  ])('rejects %s', (_label, value) => {
    expect(isMediaItem(value)).toBe(false);
  });
});

describe('reduceMedia', () => {
  const run = (state: MediaState, command: MediaCommand) => reduceMedia(state, command);

  it('starts empty, with nothing chosen and Fit', () => {
    expect(INITIAL_MEDIA_STATE.library).toEqual([]);
    expect(INITIAL_MEDIA_STATE.singleImage).toEqual({ imageId: null, fit: 'fit' });
  });

  describe('addMedia', () => {
    it('appends the imported images in order', () => {
      const next = run(withImages(ID_A), { type: 'addMedia', items: [item(ID_B)] });
      expect(next.library.map((entry) => entry.id)).toEqual([ID_A, ID_B]);
    });

    it('adding nothing changes nothing', () => {
      const state = withImages(ID_A);
      expect(run(state, { type: 'addMedia', items: [] })).toBe(state);
    });

    it('refuses a malformed or duplicate entry, adding none of the batch', () => {
      const state = withImages(ID_A);
      expect(() => run(state, { type: 'addMedia', items: [item(ID_A)] })).toThrow(/already in the library/);
      expect(() => run(state, { type: 'addMedia', items: [item(ID_B), item('bad')] })).toThrow(RangeError);
      expect(() => run(state, { type: 'addMedia', items: [item(ID_B), item(ID_B)] })).toThrow(
        /already in the library/,
      );
      expect(() => run(state, { type: 'addMedia', items: 'x' as never })).toThrow(RangeError);
    });
  });

  describe('selectSingleImage', () => {
    it('chooses a library image, and choosing it again changes nothing', () => {
      const state = withImages(ID_A, ID_B);
      const chosen = run(state, { type: 'selectSingleImage', mediaId: ID_B });
      expect(chosen.singleImage.imageId).toBe(ID_B);
      expect(run(chosen, { type: 'selectSingleImage', mediaId: ID_B })).toBe(chosen);
    });

    it('can clear the choice', () => {
      const chosen = run(withImages(ID_A), { type: 'selectSingleImage', mediaId: ID_A });
      expect(run(chosen, { type: 'selectSingleImage', mediaId: null }).singleImage.imageId).toBeNull();
    });

    it.each([ID_B, 'nope', '', 7, undefined])(
      'refuses an image that is not in the library (%j)',
      (mediaId) => {
        expect(() => run(withImages(ID_A), { type: 'selectSingleImage', mediaId: mediaId as never })).toThrow(
          RangeError,
        );
      },
    );

    it('keeps the Fit mode', () => {
      const fill = run(withImages(ID_A), { type: 'setSingleImageFit', fit: 'fill' });
      expect(run(fill, { type: 'selectSingleImage', mediaId: ID_A }).singleImage).toEqual({
        imageId: ID_A,
        fit: 'fill',
      });
    });
  });

  describe('setSingleImageFit', () => {
    it('switches between Fit and Fill, and the same value changes nothing', () => {
      const fill = run(INITIAL_MEDIA_STATE, { type: 'setSingleImageFit', fit: 'fill' });
      expect(fill.singleImage.fit).toBe('fill');
      expect(run(fill, { type: 'setSingleImageFit', fit: 'fill' })).toBe(fill);
      expect(run(fill, { type: 'setSingleImageFit', fit: 'fit' }).singleImage.fit).toBe('fit');
    });

    it.each(['stretch', '', 'FIT', null, 1])('refuses %j', (fit) => {
      expect(() => run(INITIAL_MEDIA_STATE, { type: 'setSingleImageFit', fit: fit as never })).toThrow(
        RangeError,
      );
    });
  });

  describe('removeMedia', () => {
    it('removes the image', () => {
      const next = run(withImages(ID_A, ID_B), { type: 'removeMedia', mediaId: ID_A });
      expect(next.library.map((entry) => entry.id)).toEqual([ID_B]);
    });

    it('clears the choice if it was the chosen image, and leaves it alone otherwise', () => {
      const chosen = run(withImages(ID_A, ID_B), { type: 'selectSingleImage', mediaId: ID_A });
      expect(run(chosen, { type: 'removeMedia', mediaId: ID_A }).singleImage.imageId).toBeNull();
      expect(run(chosen, { type: 'removeMedia', mediaId: ID_B }).singleImage.imageId).toBe(ID_A);
    });

    it('keeps the Fit mode when the chosen image goes', () => {
      let state = run(withImages(ID_A), { type: 'setSingleImageFit', fit: 'fill' });
      state = run(state, { type: 'selectSingleImage', mediaId: ID_A });
      expect(run(state, { type: 'removeMedia', mediaId: ID_A }).singleImage).toEqual({
        imageId: null,
        fit: 'fill',
      });
    });

    it('refuses an unknown image', () => {
      expect(() => run(withImages(ID_A), { type: 'removeMedia', mediaId: ID_B })).toThrow(RangeError);
    });
  });

  it('refuses an unknown command type', () => {
    expect(() => run(INITIAL_MEDIA_STATE, { type: 'explode' } as unknown as MediaCommand)).toThrow(
      /Unhandled media command/,
    );
  });
});
