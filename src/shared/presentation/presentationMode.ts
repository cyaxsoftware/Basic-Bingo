/**
 * What the audience display is showing. This is operator-facing display state,
 * deliberately separate from the game (calls, banner, pattern): switching modes
 * must never change a game field, and a new game must not change the mode.
 */

export const PRESENTATION_MODES = ['gameBoard', 'slideshow', 'singleImage', 'countdown'] as const;

export type PresentationMode = (typeof PRESENTATION_MODES)[number];

export const DEFAULT_PRESENTATION_MODE: PresentationMode = 'gameBoard';

export function isPresentationMode(value: unknown): value is PresentationMode {
  return typeof value === 'string' && (PRESENTATION_MODES as readonly string[]).includes(value);
}

/** Operator-facing names, matching the Controller's mode tabs (design doc §4.1). */
export const PRESENTATION_MODE_LABELS: Readonly<Record<PresentationMode, string>> = {
  gameBoard: 'Game Board',
  slideshow: 'Slideshow',
  singleImage: 'Single Image',
  countdown: 'Countdown',
};
