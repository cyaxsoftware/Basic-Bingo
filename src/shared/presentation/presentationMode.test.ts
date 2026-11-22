import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PRESENTATION_MODE,
  isPresentationMode,
  PRESENTATION_MODE_LABELS,
  PRESENTATION_MODES,
} from './presentationMode';

describe('presentation mode', () => {
  it('defaults to the game board', () => {
    expect(DEFAULT_PRESENTATION_MODE).toBe('gameBoard');
  });

  it.each(PRESENTATION_MODES)('accepts %s', (mode) => {
    expect(isPresentationMode(mode)).toBe(true);
  });

  it.each(['', 'GameBoard', 'game board', 'photos', 3, null, undefined, {}, ['gameBoard']])(
    'rejects %j',
    (value) => {
      expect(isPresentationMode(value)).toBe(false);
    },
  );

  it('has an operator-facing label for every mode', () => {
    expect(Object.keys(PRESENTATION_MODE_LABELS).toSorted()).toEqual([...PRESENTATION_MODES].toSorted());
  });
});
