/**
 * Imported images (the media library) and the rules about them.
 *
 * Pure module: no Electron, Node, React or clocks, so main, preload and both renderers can use it.
 *
 * Images are copied into the app's own media folder when they are imported (see docs/architecture.md), so they
 * survive the original USB stick being removed. A library entry stores only metadata; the file's name is derived
 * from the entry (`<id>.<extension>`), never stored, so a damaged or hand-edited save file cannot point the app at
 * some other file on the disk.
 */

/** The only image formats the library accepts. */
export const IMAGE_FORMATS = ['png', 'jpeg', 'webp', 'gif'] as const;
export type ImageFormat = (typeof IMAGE_FORMATS)[number];

/** Larger files are refused at import (a sponsor logo or a slide is nowhere near this). */
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
/** The original file name is kept for the operator to recognize the image; longer ones are cut. */
export const MAX_MEDIA_NAME_LENGTH = 200;

/** The custom, read-only protocol the windows use to show a library image: `bingo-media://<id>`. */
export const MEDIA_PROTOCOL = 'bingo-media';

const FILE_EXTENSION: Record<ImageFormat, string> = { png: 'png', jpeg: 'jpg', webp: 'webp', gif: 'gif' };
const MIME_TYPE: Record<ImageFormat, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
};

/** One imported image. Metadata only: the pixels are in the media folder. */
export interface MediaItem {
  /** A UUID generated at import. It is the only thing that identifies the image, in the protocol URL and on disk. */
  readonly id: string;
  /** The original file name, for the operator ("Legion sponsors.png"). */
  readonly name: string;
  readonly format: ImageFormat;
  readonly bytes: number;
  readonly width: number;
  readonly height: number;
  /** ISO timestamp of the import. Informational. */
  readonly addedAt: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Ids are lowercase UUIDs, which is what makes them safe in a file name and in a URL host. */
export function isValidMediaId(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

export function isImageFormat(value: unknown): value is ImageFormat {
  return typeof value === 'string' && (IMAGE_FORMATS as readonly string[]).includes(value);
}

/** The file name of an image inside the media folder. Derived, so it can never be anything but `<uuid>.<ext>`. */
export function mediaFileName(item: Pick<MediaItem, 'id' | 'format'>): string {
  return `${item.id}.${FILE_EXTENSION[item.format]}`;
}

export function mimeTypeFor(format: ImageFormat): string {
  return MIME_TYPE[format];
}

/** The address a window uses to show an image. */
export function mediaUrl(id: string): string {
  return `${MEDIA_PROTOCOL}://${id}`;
}

/** The original name with any folder part removed and the length capped. Never empty. */
export function cleanMediaName(fileName: unknown): string {
  const text = typeof fileName === 'string' ? fileName : '';
  const base = text.split(/[\\/]/).pop()?.trim() ?? '';
  const name = base.length > 0 ? base : 'Image';
  return name.length > MAX_MEDIA_NAME_LENGTH ? name.slice(0, MAX_MEDIA_NAME_LENGTH) : name;
}

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0;

/** True for a well-formed library entry. Used to check what main builds and what comes back from a save file. */
export function isMediaItem(value: unknown): value is MediaItem {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    isValidMediaId(item['id']) &&
    typeof item['name'] === 'string' &&
    item['name'].length > 0 &&
    item['name'].length <= MAX_MEDIA_NAME_LENGTH &&
    isImageFormat(item['format']) &&
    isPositiveInteger(item['bytes']) &&
    item['bytes'] <= MAX_IMAGE_BYTES &&
    isPositiveInteger(item['width']) &&
    isPositiveInteger(item['height']) &&
    typeof item['addedAt'] === 'string'
  );
}
