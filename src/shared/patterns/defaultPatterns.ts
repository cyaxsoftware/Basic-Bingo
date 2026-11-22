/**
 * The patterns a fresh installation starts with.
 *
 * Each is defined by a picture, and the center square is on ONLY where the picture says so. Four Corners,
 * Big L and Small Diamond leave it off; Letter X and Blackout include it because their shapes do. Nothing
 * here, or anywhere else, treats the center as a free space.
 */
import { cellsFromPicture, type Pattern, type PatternLibrary } from './pattern';

/** A fixed timestamp, so the seeded library is the same on every machine and in every test. */
export const SEED_TIMESTAMP = '2026-01-01T00:00:00.000Z';

const DEFINITIONS: ReadonlyArray<{ id: string; title: string; picture: readonly string[] }> = [
  { id: 'seed-four-corners', title: 'Four Corners', picture: ['X...X', '.....', '.....', '.....', 'X...X'] },
  { id: 'seed-big-l', title: 'Big L', picture: ['X....', 'X....', 'X....', 'X....', 'XXXXX'] },
  { id: 'seed-letter-x', title: 'Letter X', picture: ['X...X', '.X.X.', '..X..', '.X.X.', 'X...X'] },
  { id: 'seed-blackout', title: 'Blackout', picture: ['XXXXX', 'XXXXX', 'XXXXX', 'XXXXX', 'XXXXX'] },
  {
    id: 'seed-small-diamond',
    title: 'Small Diamond',
    picture: ['.....', '..X..', '.X.X.', '..X..', '.....'],
  },
];

export function createDefaultLibrary(): PatternLibrary {
  return DEFINITIONS.map(({ id, title, picture }): Pattern => ({
    id,
    title,
    cells: cellsFromPicture(picture),
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  }));
}
