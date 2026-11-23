import { describe, expect, it } from 'vitest';
import {
  classifyStorageError,
  describeCopyFailure,
  describeSaveFailure,
  type StorageProblemKind,
} from './storageProblem';

const withCode = (code: string) => Object.assign(new Error(`${code}: something, open 'C:\\x'`), { code });

describe('classifyStorageError', () => {
  it.each([
    ['ENOSPC', 'disk-full'],
    ['EDQUOT', 'disk-full'],
    ['EACCES', 'access-denied'],
    ['EPERM', 'access-denied'],
    ['EROFS', 'access-denied'],
    ['EBUSY', 'file-busy'],
    ['ETXTBSY', 'file-busy'],
    ['EMFILE', 'file-busy'],
    ['ENOENT', 'folder-missing'],
    ['ENOTDIR', 'folder-missing'],
    ['ENODEV', 'folder-missing'],
    ['EIO', 'disk-error'],
    ['EWHATEVER', 'other'],
  ] as const)('sorts %s as %s', (code, kind) => {
    expect(classifyStorageError(withCode(code))).toBe(kind);
  });

  it.each([undefined, null, 'disk full', 42, {}, new Error('plain'), { code: 7 }])(
    'treats %j as an unrecognised problem',
    (error) => {
      expect(classifyStorageError(error)).toBe('other');
    },
  );
});

describe('the messages', () => {
  const kinds: readonly StorageProblemKind[] = [
    'disk-full',
    'access-denied',
    'file-busy',
    'folder-missing',
    'disk-error',
    'other',
  ];

  it.each(kinds)('%s says what to do and mentions no path or internal file name', (kind) => {
    const text = describeSaveFailure(kind);
    expect(text).toMatch(/Try again/);
    expect(text).not.toMatch(/state\.json|\.tmp|\.bak|[A-Za-z]:\\|\\\\|ENOSPC|EACCES|EBUSY|ENOENT|EIO|EPERM/);
    expect(describeCopyFailure(kind)).not.toMatch(/[A-Za-z]:\\|state\.json|ENOSPC|EACCES/);
  });

  it('offers Show data folder where looking at the folder helps', () => {
    expect(describeSaveFailure('access-denied')).toMatch(/Show data folder/);
    expect(describeSaveFailure('other')).toMatch(/Show data folder/);
    expect(describeSaveFailure('disk-full')).not.toMatch(/Show data folder/);
  });

  it('has a different message for each kind of problem', () => {
    expect(new Set(kinds.map(describeSaveFailure)).size).toBe(kinds.length);
    expect(new Set(kinds.map(describeCopyFailure)).size).toBe(kinds.length);
  });
});
