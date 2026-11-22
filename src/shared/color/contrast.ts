/**
 * WCAG 2.x colour contrast for #rrggbb colours.
 * https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio
 */

/** Relative luminance of a #rrggbb colour, from 0 (black) to 1 (white). */
export function relativeLuminance(hex: string): number {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match?.[1]) throw new RangeError(`Expected a #rrggbb colour, got "${hex}".`);
  const [r, g, b] = [0, 2, 4].map((offset) => {
    const channel = parseInt(match[1]!.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio between two colours, from 1 (identical) to 21 (black on white). Order does not matter. */
export function contrastRatio(a: string, b: string): number {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].toSorted((x, y) => y - x) as [
    number,
    number,
  ];
  return (lighter + 0.05) / (darker + 0.05);
}

/** WCAG AA for normal-size text. Numerals on balls are large, but the stricter bar is the house rule. */
export const MIN_TEXT_CONTRAST = 4.5;
