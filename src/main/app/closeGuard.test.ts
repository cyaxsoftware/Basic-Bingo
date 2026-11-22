import { describe, expect, it, vi } from 'vitest';
import type { SaveOutcome } from '../state/appStore';
import { confirmClose, describeUnsavedGame, type CloseChoice, type CloseGuardDeps } from './closeGuard';

function deps(outcomes: SaveOutcome[], choices: CloseChoice[] = []): CloseGuardDeps {
  return {
    deadlineMs: 2000,
    settleSaves: vi.fn(async () => outcomes.shift() ?? 'saved'),
    retrySave: vi.fn(),
    ask: vi.fn(async () => choices.shift() ?? 'keepOpen'),
  };
}

describe('confirmClose', () => {
  it('closes immediately when everything is saved, without asking', async () => {
    const d = deps(['saved']);
    expect(await confirmClose(d)).toBe(true);
    expect(d.ask).not.toHaveBeenCalled();
    expect(d.settleSaves).toHaveBeenCalledWith(2000);
  });

  it('asks when the final save failed, and keeps the app open if chosen', async () => {
    const d = deps(['failed'], ['keepOpen']);
    expect(await confirmClose(d)).toBe(false);
    expect(d.ask).toHaveBeenCalledWith('failed');
  });

  it('reports a slow save as a timeout, not as success', async () => {
    const d = deps(['timeout'], ['keepOpen']);
    expect(await confirmClose(d)).toBe(false);
    expect(d.ask).toHaveBeenCalledWith('timeout');
  });

  it('quits anyway when the operator chooses to', async () => {
    const d = deps(['failed'], ['quit']);
    expect(await confirmClose(d)).toBe(true);
  });

  it('retries the save and closes once it succeeds', async () => {
    const d = deps(['failed', 'saved'], ['retry']);
    expect(await confirmClose(d)).toBe(true);
    expect(d.retrySave).toHaveBeenCalledOnce();
    expect(d.ask).toHaveBeenCalledOnce();
  });

  it('asks again if the retry also fails', async () => {
    const d = deps(['failed', 'failed'], ['retry', 'keepOpen']);
    expect(await confirmClose(d)).toBe(false);
    expect(d.ask).toHaveBeenCalledTimes(2);
  });
});

describe('describeUnsavedGame', () => {
  it('words failures and timeouts differently', () => {
    expect(describeUnsavedGame('failed').message).toMatch(/could not be saved/);
    expect(describeUnsavedGame('timeout').message).toMatch(/taking longer/);
  });
});
