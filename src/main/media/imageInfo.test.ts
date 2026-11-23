import { describe, expect, it } from 'vitest';
import { readImageInfo } from './imageInfo';
import {
  gifBytes,
  jpegBytes,
  pngBytes,
  webpExtendedBytes,
  webpLosslessBytes,
  webpLossyBytes,
} from './testImages';

describe('readImageInfo', () => {
  it.each([
    ['png', pngBytes(1200, 600), 1200, 600],
    ['gif', gifBytes(320, 240), 320, 240],
    ['jpeg', jpegBytes(1920, 1080), 1920, 1080],
    ['webp (lossy)', webpLossyBytes(800, 450), 800, 450],
    ['webp (lossless)', webpLosslessBytes(641, 359), 641, 359],
    ['webp (extended)', webpExtendedBytes(4000, 3000), 4000, 3000],
  ])('reads a %s file', (name, bytes, width, height) => {
    const info = readImageInfo(bytes);
    expect(info, name).not.toBeNull();
    expect(info?.width).toBe(width);
    expect(info?.height).toBe(height);
    expect(info?.format).toBe(name.startsWith('webp') ? 'webp' : name);
  });

  it('trusts the content, not a file name: a JPEG is a JPEG whatever it is called', () => {
    expect(readImageInfo(jpegBytes(10, 10))?.format).toBe('jpeg');
  });

  it('skips over other JPEG segments to find the frame header', () => {
    const info = readImageInfo(jpegBytes(555, 333));
    expect(info).toEqual({ format: 'jpeg', width: 555, height: 333 });
  });

  it.each([
    ['text', Buffer.from('This is not an image at all.')],
    ['an empty file', Buffer.alloc(0)],
    ['a bitmap', Buffer.from([0x42, 0x4d, 0x36, 0, 0, 0, 0, 0, 0, 0, 0x36, 0, 0, 0])],
    ['an SVG', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>')],
    ['a PDF', Buffer.from('%PDF-1.7\n1 0 obj\n')],
  ])('refuses %s', (_name, bytes) => {
    expect(readImageInfo(bytes)).toBeNull();
  });

  it('refuses files that are cut short instead of reading past the end', () => {
    for (const bytes of [pngBytes(10, 10), gifBytes(10, 10), jpegBytes(10, 10), webpLossyBytes(10, 10)]) {
      for (const length of [1, 3, 8, 12, 20]) {
        expect(() => readImageInfo(bytes.subarray(0, length))).not.toThrow();
      }
    }
    expect(readImageInfo(pngBytes(10, 10).subarray(0, 20))).toBeNull();
    expect(readImageInfo(jpegBytes(10, 10).subarray(0, 12))).toBeNull();
  });

  it('refuses a zero or absurd size in the header', () => {
    expect(readImageInfo(pngBytes(0, 100))).toBeNull();
    expect(readImageInfo(pngBytes(100, 0))).toBeNull();
    expect(readImageInfo(pngBytes(100_001, 10))).toBeNull();
    expect(readImageInfo(gifBytes(0, 0))).toBeNull();
  });

  it('works on a view into a larger buffer', () => {
    const png = pngBytes(64, 32);
    const padded = Buffer.concat([Buffer.from([1, 2, 3, 4, 5]), png]);
    expect(readImageInfo(padded.subarray(5))).toEqual({ format: 'png', width: 64, height: 32 });
  });
});
