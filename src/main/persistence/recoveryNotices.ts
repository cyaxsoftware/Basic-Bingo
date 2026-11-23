import type { Notice } from '../../shared/ipc/contract';
import type { LoadResult } from './stateRepository';

/**
 * What the operator is told after the saved game was loaded, when it was not simply read as it was. Plain words, no
 * file names (the details are in the log). Problems that leave files behind offer Show data folder so someone can
 * look at them.
 *
 * Two different things can go wrong, and they are told apart:
 *  - the file was DAMAGED (it opened but is not a usable game), so a good copy was restored or a new game started;
 *  - the file could not be OPENED (another program has it locked, or Windows is blocking it). The game may be fine,
 *    just out of reach, so the advice is to close other programs and restart, not to give up on it.
 */
export function recoveryNotices(loaded: LoadResult): Notice[] {
  if (loaded.source === 'backup') {
    return [
      {
        id: 'state-recovered-from-backup',
        level: 'warning',
        message: loaded.blocked
          ? 'The latest saved game could not be opened (another program may have it locked, or Windows may be blocking it), so the previous copy was used. If the called numbers look out of date, close other programs and restart the app. Press Show data folder to look at it.'
          : 'The saved game was damaged, so the last good copy from just before it was restored. Please check that the called numbers are right.',
        action: 'showDataFolder',
      },
    ];
  }
  if (loaded.source === 'defaults' && loaded.issues.length > 0) {
    return [
      {
        id: 'state-reset-unreadable',
        level: 'error',
        message: loaded.blocked
          ? 'The saved game could not be opened (another program may have it locked, or Windows may be blocking it), so a new game was started. Your earlier game has not been deleted: close other programs and restart the app, or press Show data folder to look at it.'
          : 'The saved game was damaged and there was no good copy, so a new game was started. The damaged file was kept so someone can look at it: press Show data folder.',
        action: 'showDataFolder',
      },
    ];
  }
  if (loaded.issues.length > 0) {
    return [
      {
        id: 'state-normalized',
        level: 'info',
        message: `Part of the saved game was damaged and has been repaired: ${loaded.issues.join(' ')}`,
      },
    ];
  }
  return [];
}
