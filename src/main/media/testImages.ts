/**
 * Tiny, header-only image files for tests: just enough bytes for the image reader to recognize the format and
 * read the size. Not decodable pictures; nothing outside the tests imports this.
 */

const text = (value: string): number[] => Array.from(value, (char) => char.charCodeAt(0));
const be32 = (value: number): number[] => [
  (value >>> 24) & 0xff,
  (value >>> 16) & 0xff,
  (value >>> 8) & 0xff,
  value & 0xff,
];
const be16 = (value: number): number[] => [(value >>> 8) & 0xff, value & 0xff];
const le16 = (value: number): number[] => [value & 0xff, (value >>> 8) & 0xff];
const le32 = (value: number): number[] => [
  value & 0xff,
  (value >>> 8) & 0xff,
  (value >>> 16) & 0xff,
  (value >>> 24) & 0xff,
];
const le24 = (value: number): number[] => [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff];

export function pngBytes(width: number, height: number): Buffer {
  return Buffer.from([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...be32(13),
    ...text('IHDR'),
    ...be32(width),
    ...be32(height),
    8,
    2,
    0,
    0,
    0,
    ...be32(0),
    ...be32(0),
    ...text('IEND'),
    ...be32(0),
  ]);
}

export function gifBytes(width: number, height: number): Buffer {
  return Buffer.from([...text('GIF89a'), ...le16(width), ...le16(height), 0, 0, 0, 0x3b]);
}

export function jpegBytes(width: number, height: number): Buffer {
  const app0 = [0xff, 0xe0, ...be16(16), ...text('JFIF'), 0, 1, 1, 0, ...be16(1), ...be16(1), 0, 0];
  const sof0 = [
    0xff,
    0xc0,
    ...be16(17),
    8,
    ...be16(height),
    ...be16(width),
    3,
    1,
    0x22,
    0,
    2,
    0x11,
    1,
    3,
    0x11,
    1,
  ];
  return Buffer.from([0xff, 0xd8, ...app0, ...sof0, 0xff, 0xd9]);
}

function riff(chunk: string, data: number[]): Buffer {
  const body = [...text('WEBP'), ...text(chunk), ...le32(data.length), ...data];
  return Buffer.from([...text('RIFF'), ...le32(body.length), ...body]);
}

/** WebP, lossy ("VP8 "). */
export function webpLossyBytes(width: number, height: number): Buffer {
  return riff('VP8 ', [0x10, 0x02, 0x00, 0x9d, 0x01, 0x2a, ...le16(width), ...le16(height)]);
}

/** WebP, lossless ("VP8L"). */
export function webpLosslessBytes(width: number, height: number): Buffer {
  return riff('VP8L', [0x2f, ...le32(((height - 1) << 14) | (width - 1))]);
}

/** WebP, extended ("VP8X"). */
export function webpExtendedBytes(width: number, height: number): Buffer {
  return riff('VP8X', [0, 0, 0, 0, ...le24(width - 1), ...le24(height - 1)]);
}
