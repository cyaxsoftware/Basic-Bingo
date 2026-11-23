import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTROLLER_THEME, isControllerTheme } from './controllerTheme';

describe('controllerTheme', () => {
  it('accepts exactly light and dark', () => {
    expect(isControllerTheme('light')).toBe(true);
    expect(isControllerTheme('dark')).toBe(true);
    for (const bad of ['Dark', 'auto', '', null, undefined, 1, {}])
      expect(isControllerTheme(bad)).toBe(false);
  });

  it('defaults to light', () => {
    expect(DEFAULT_CONTROLLER_THEME).toBe('light');
  });
});
