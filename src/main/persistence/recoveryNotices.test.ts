import { describe, expect, it } from 'vitest';
import { createDefaultPersistedState } from './persistedState';
import { recoveryNotices } from './recoveryNotices';
import type { LoadResult } from './stateRepository';

const loaded = (over: Partial<LoadResult>): LoadResult => ({
  state: createDefaultPersistedState(),
  source: 'primary',
  issues: [],
  blocked: false,
  ...over,
});

const NO_INTERNALS = /state\.json|\.bak|\.tmp|unreadable-|[A-Za-z]:\\|EACCES|EBUSY|EPERM|JSON/;

describe('recoveryNotices', () => {
  it('says nothing when the saved game simply loaded', () => {
    expect(recoveryNotices(loaded({}))).toEqual([]);
  });

  it('says a damaged game was restored from the last good copy, and offers the data folder', () => {
    const [notice, ...rest] = recoveryNotices(
      loaded({ source: 'backup', issues: ['state.json is not valid JSON (Unexpected token).'] }),
    );
    expect(rest).toEqual([]);
    expect(notice).toMatchObject({
      id: 'state-recovered-from-backup',
      level: 'warning',
      action: 'showDataFolder',
    });
    expect(notice?.message).toMatch(/damaged/);
    expect(notice?.message).toMatch(/last good copy/);
    expect(notice?.message).toMatch(/check that the called numbers/);
    expect(notice?.message).not.toMatch(NO_INTERNALS);
  });

  it('says a locked game was not used, and tells the operator how to get it back (not that it is damaged)', () => {
    const [notice] = recoveryNotices(
      loaded({ source: 'backup', blocked: true, issues: ['Could not read state.json: EBUSY'] }),
    );
    expect(notice?.message).toMatch(/could not be opened/);
    expect(notice?.message).toMatch(/locked/);
    expect(notice?.message).toMatch(/restart/);
    expect(notice?.message).not.toMatch(/damaged/);
    expect(notice?.message).not.toMatch(NO_INTERNALS);
    expect(notice?.action).toBe('showDataFolder');
  });

  it('says a new game was started when the file was damaged and there was no good copy', () => {
    const [notice] = recoveryNotices(
      loaded({
        source: 'defaults',
        issues: ['state.json is not valid JSON.', 'Moved unreadable file aside.'],
      }),
    );
    expect(notice).toMatchObject({ id: 'state-reset-unreadable', level: 'error', action: 'showDataFolder' });
    expect(notice?.message).toMatch(/damaged/);
    expect(notice?.message).toMatch(/new game was started/);
    expect(notice?.message).toMatch(/kept/);
    expect(notice?.message).not.toMatch(NO_INTERNALS);
  });

  it('says the earlier game has NOT been deleted when the file could not be opened and a new game was started', () => {
    const [notice] = recoveryNotices(
      loaded({ source: 'defaults', blocked: true, issues: ['Could not read state.json: EACCES'] }),
    );
    expect(notice?.message).toMatch(/could not be opened/);
    expect(notice?.message).toMatch(/not been deleted/);
    expect(notice?.message).not.toMatch(/damaged/);
    expect(notice?.message).not.toMatch(NO_INTERNALS);
  });

  it('says a fresh install (defaults and no problems) is not a problem', () => {
    expect(recoveryNotices(loaded({ source: 'defaults' }))).toEqual([]);
  });

  it('reports repairs made to an otherwise readable game, without an action', () => {
    const [notice] = recoveryNotices(
      loaded({ issues: ['Dropped 2 damaged entries from the games-played history.'] }),
    );
    expect(notice).toMatchObject({ id: 'state-normalized', level: 'info' });
    expect(notice?.action).toBeUndefined();
    expect(notice?.message).toContain('Dropped 2 damaged entries');
  });
});
