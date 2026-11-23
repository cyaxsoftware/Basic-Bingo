/**
 * Read what an image file really is (its format and pixel size) from its first bytes.
 *
 * The importer trusts the CONTENT, not the file name: a text file renamed "logo.png" is refused, and a JPEG
 * named "logo.png" is stored as a JPEG. Only PNG, JPEG, WebP and GIF are understood. No decoding happens: just the
 * few header fields that hold the size, so it needs no library and cannot be tricked into allocating a huge image.
 */
import type { ImageFormat } from '../../shared/media';

export interface ImageInfo {
  readonly format: ImageFormat;
  readonly width: number;
  readonly height: number;
}

/** A sanity cap: no real image is wider or taller than this, so a header claiming more is corrupt. */
const MAX_DIMENSION = 100_000;

const ascii = (bytes: Uint8Array, start: number, length: number): string =>
  String.fromCharCode(...bytes.subarray(start, start + length));

const validDimension = (value: number): boolean =>
  Number.isInteger(value) && value > 0 && value <= MAX_DIMENSION;

function sized(format: ImageFormat, width: number, height: number): ImageInfo | null {
  return validDimension(width) && validDimension(height) ? { format, width, height } : null;
}

function readPng(bytes: Uint8Array, view: DataView): ImageInfo | null {
  // 8-byte signature, then the IHDR chunk: length(4) "IHDR"(4) width(4) height(4).
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 24 || signature.some((byte, index) => bytes[index] !== byte)) return null;
  if (ascii(bytes, 12, 4) !== 'IHDR') return null;
  return sized('png', view.getUint32(16), view.getUint32(20));
}

function readGif(bytes: Uint8Array, view: DataView): ImageInfo | null {
  if (bytes.length < 10) return null;
  const header = ascii(bytes, 0, 6);
  if (header !== 'GIF87a' && header !== 'GIF89a') return null;
  return sized('gif', view.getUint16(6, true), view.getUint16(8, true));
}

function readJpeg(bytes: Uint8Array, view: DataView): ImageInfo | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let index = 2;
  while (index + 4 <= bytes.length) {
    if (bytes[index] !== 0xff) {
      index += 1;
      continue;
    }
    const marker = bytes[index + 1] ?? 0;
    if (marker === 0xff) {
      index += 1; // padding
      continue;
    }
    // Markers with no length: standalone (SOI, TEM) and the restart markers.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      index += 2;
      continue;
    }
    if (marker === 0xd9) return null; // end of image before any frame header
    const length = view.getUint16(index + 2);
    // A frame header (SOF0..SOF15, except DHT 0xC4, JPG 0xC8 and DAC 0xCC) holds the size.
    const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrame) {
      if (index + 9 > bytes.length) return null;
      return sized('jpeg', view.getUint16(index + 7), view.getUint16(index + 5));
    }
    if (length < 2) return null;
    index += 2 + length;
  }
  return null;
}

function readWebp(bytes: Uint8Array, view: DataView): ImageInfo | null {
  // RIFF <size> WEBP, then the first chunk: a four-letter name, a size, and its data.
  if (bytes.length < 21 || ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WEBP') return null;
  const chunk = ascii(bytes, 12, 4);
  const data = 20;
  if (chunk === 'VP8 ') {
    // Lossy: a 3-byte frame tag, the start code 9D 01 2A, then 14-bit width and height.
    if (bytes[data + 3] !== 0x9d || bytes[data + 4] !== 0x01 || bytes[data + 5] !== 0x2a) return null;
    return sized('webp', view.getUint16(data + 6, true) & 0x3fff, view.getUint16(data + 8, true) & 0x3fff);
  }
  if (chunk === 'VP8L') {
    // Lossless: signature byte 0x2F, then 14-bit (width - 1) and (height - 1).
    if (bytes[data] !== 0x2f) return null;
    const bits = view.getUint32(data + 1, true);
    return sized('webp', (bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
  }
  if (chunk === 'VP8X') {
    // Extended: 24-bit (canvas width - 1) and (canvas height - 1) after four flag bytes.
    const read24 = (at: number) =>
      (bytes[at] ?? 0) | ((bytes[at + 1] ?? 0) << 8) | ((bytes[at + 2] ?? 0) << 16);
    return sized('webp', read24(data + 4) + 1, read24(data + 7) + 1);
  }
  return null;
}

/** The format and size of a PNG, JPEG, WebP or GIF, or null for anything else (or a damaged header). */
export function readImageInfo(bytes: Uint8Array): ImageInfo | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  try {
    return readPng(bytes, view) ?? readGif(bytes, view) ?? readJpeg(bytes, view) ?? readWebp(bytes, view);
  } catch {
    // A header cut short can read past the end; that is just "not a usable image".
    return null;
  }
}
