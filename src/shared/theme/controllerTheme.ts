/**
 * The Controller's colour theme. Only the Controller window is themed: the Presentation window ignores it, so
 * the audience always sees the same display. Kept in shared code because main stores it and the renderer shows it.
 */
export type ControllerTheme = 'light' | 'dark';

export const CONTROLLER_THEMES: readonly ControllerTheme[] = ['light', 'dark'];

export const DEFAULT_CONTROLLER_THEME: ControllerTheme = 'light';

export function isControllerTheme(value: unknown): value is ControllerTheme {
  return value === 'light' || value === 'dark';
}
