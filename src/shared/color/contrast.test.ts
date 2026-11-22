import { describe, expect, it } from 'vitest';
import { contrastRatio, relativeLuminance } from './contrast';

describe('contrast', () => {
  it('matches the WCAG reference values', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#ffffff', '#ffffff')).toBe(1);
    // A well-known mid-grey: #767676 on white is the classic "just passes AA" 4.54:1.
    expect(contrastRatio('#767676', '#ffffff')).toBeCloseTo(4.54, 2);
  });

  it('does not depend on argument order or letter case', () => {
    expect(contrastRatio('#111827', '#FBCF24')).toBe(contrastRatio('#fbcf24', '#111827'));
  });

  it('computes luminance from 0 to 1', () => {
    expect(relativeLuminance('#000000')).toBe(0);
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 10);
  });

  it.each(['red', '#fff', '#12345', '#gggggg', ''])('rejects %j, which is not #rrggbb', (value) => {
    expect(() => relativeLuminance(value)).toThrow(RangeError);
  });
});
