import { describe, expect, it } from 'vitest';
import { MAX_BRAND_NAME_LENGTH, parseBranding } from './branding';

describe('branding settings', () => {
  it('supports an independently optional name and logo and explicit clearing', () => {
    const logoId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    expect(parseBranding({ name: '  Community Bingo Night  ', logoId: null })).toEqual({
      name: 'Community Bingo Night',
      logoId: null,
    });
    expect(parseBranding({ name: '', logoId })).toEqual({ name: '', logoId });
    expect(parseBranding(null)).toBeNull();
  });

  it.each([
    undefined,
    { name: '', logoId: null },
    { name: ' ', logoId: null },
    { name: 'x'.repeat(MAX_BRAND_NAME_LENGTH + 1), logoId: null },
    { name: 'Club', logoId: 'https://example.test/logo.png' },
    { name: 'Club', logoId: null, other: true },
  ])('rejects malformed settings %j', (input) => {
    expect(parseBranding(input)).toBeUndefined();
  });
});
