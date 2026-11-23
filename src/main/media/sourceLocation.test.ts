import { describe, expect, it, vi } from 'vitest';
import { networkSourceProblem } from './sourceLocation';

// Windows paths are written with doubled backslashes: '\\\\server\\share' is the text \\server\share.
const UNC = '\\\\fileserver\\events\\slide.png';

describe('networkSourceProblem', () => {
  it('refuses a UNC path without touching it', async () => {
    const resolveRoot = vi.fn(async (root: string) => root);
    for (const source of [
      UNC,
      '//fileserver/events/slide.png',
      '\\\\?\\UNC\\fileserver\\events\\slide.png',
      '\\\\.\\PhysicalDrive1',
    ]) {
      expect(await networkSourceProblem(source, resolveRoot)).toMatch(/network location/);
    }
    expect(resolveRoot).not.toHaveBeenCalled();
  });

  it('refuses a mapped network drive, which looks like an ordinary drive letter', async () => {
    const resolveRoot = vi.fn(async () => '\\\\fileserver\\events\\');
    expect(await networkSourceProblem('Z:\\2026\\slide.png', resolveRoot)).toMatch(/network location/);
    expect(resolveRoot).toHaveBeenCalledWith('Z:\\');
  });

  it('looks only at the drive root, never at the file', async () => {
    const resolveRoot = vi.fn(async (root: string) => root);
    await networkSourceProblem('E:\\photos\\2026\\slide.png', resolveRoot);
    expect(resolveRoot).toHaveBeenCalledTimes(1);
    expect(resolveRoot).toHaveBeenCalledWith('E:\\');
  });

  it('allows an internal drive, a USB stick and a subst drive that resolve to a local path', async () => {
    const resolveRoot = async (root: string) => (root === 'S:\\' ? 'C:\\Shows\\' : root);
    for (const source of ['C:\\Users\\me\\slide.png', 'E:\\slide.png', 'S:\\slide.png']) {
      expect(await networkSourceProblem(source, resolveRoot)).toBeNull();
    }
  });

  it('refuses a drive that cannot be looked at, rather than reading from it anyway', async () => {
    const resolveRoot = async () => {
      throw new Error('ENOENT');
    };
    expect(await networkSourceProblem('F:\\slide.png', resolveRoot)).toBe('its drive could not be checked');
  });

  it('has nothing to say about a path with no drive (it is not a network path)', async () => {
    const resolveRoot = vi.fn(async (root: string) => root);
    expect(await networkSourceProblem('/home/me/slide.png', resolveRoot)).toBeNull();
    expect(resolveRoot).not.toHaveBeenCalled();
  });
});
