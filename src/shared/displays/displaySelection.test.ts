import { describe, expect, it } from 'vitest';
import {
  chooseDefaultDisplayId,
  describeDisplays,
  projectableDisplays,
  type DisplayLike,
} from './displaySelection';

const laptop: DisplayLike = {
  id: 1,
  label: 'Built-in Display',
  bounds: { x: 0, y: 0, width: 1536, height: 864 },
  scaleFactor: 1.25,
  internal: true,
};
const projector: DisplayLike = {
  id: 2,
  label: '',
  bounds: { x: 1536, y: 0, width: 1920, height: 1080 },
  scaleFactor: 1,
};

describe('describeDisplays', () => {
  it('labels displays with name, physical resolution and role', () => {
    const [a, b] = describeDisplays([laptop, projector], 1, 1);
    expect(a?.label).toBe('Built-in Display — 1920×1080 (primary, Controller)');
    expect(a?.isPrimary).toBe(true);
    expect(a?.isInternal).toBe(true);
    expect(a?.hostsController).toBe(true);
    expect(b?.label).toBe('Display 2 — 1920×1080');
    expect(b?.hostsController).toBe(false);
  });

  it('handles an unknown controller display', () => {
    const infos = describeDisplays([laptop], 1, null);
    expect(infos[0]?.hostsController).toBe(false);
  });
});

describe('chooseDefaultDisplayId', () => {
  const infos = describeDisplays([laptop, projector], 1, 1);

  it('prefers the remembered display when it is still connected', () => {
    expect(chooseDefaultDisplayId(infos, 2)).toBe(2);
  });

  it('falls back to the first display without the Controller', () => {
    expect(chooseDefaultDisplayId(infos, 999)).toBe(2);
    expect(chooseDefaultDisplayId(infos, null)).toBe(2);
  });

  it('never chooses the Controller display', () => {
    expect(chooseDefaultDisplayId(infos, 1)).toBe(2);
  });

  it('returns null with a single monitor (use Preview instead)', () => {
    const single = describeDisplays([laptop], 1, 1);
    expect(projectableDisplays(single)).toEqual([]);
    expect(chooseDefaultDisplayId(single, null)).toBeNull();
  });
});
