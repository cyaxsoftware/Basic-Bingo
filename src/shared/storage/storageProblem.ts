/**
 * What went wrong when the app could not write to its data folder, in words a volunteer operator can act on.
 *
 * The raw error from Windows ("ENOSPC: no space left on device, open 'C:\Users\...\state.json.tmp'") means nothing to
 * the person running bingo night and leaks file names, so errors are sorted into a few kinds here and each kind has
 * one plain message that says what to do. Nothing here ever includes a path or an internal file name.
 */
export type StorageProblemKind =
  | 'disk-full'
  | 'access-denied'
  | 'file-busy'
  | 'folder-missing'
  | 'disk-error'
  | 'other';

const DISK_FULL = new Set(['ENOSPC', 'EDQUOT']);
const ACCESS_DENIED = new Set(['EACCES', 'EPERM', 'EROFS']);
const FILE_BUSY = new Set(['EBUSY', 'ETXTBSY', 'EMFILE', 'ENFILE']);
const FOLDER_MISSING = new Set(['ENOENT', 'ENOTDIR', 'ENODEV', 'ENXIO']);
const DISK_ERROR = new Set(['EIO', 'EBADF', 'ENOTRECOVERABLE']);

/** Sort an error from a file operation into one kind of storage problem. Anything unrecognised is `other`. */
export function classifyStorageError(error: unknown): StorageProblemKind {
  const code =
    typeof error === 'object' && error !== null && typeof (error as { code?: unknown }).code === 'string'
      ? (error as { code: string }).code
      : '';
  if (DISK_FULL.has(code)) return 'disk-full';
  if (ACCESS_DENIED.has(code)) return 'access-denied';
  if (FILE_BUSY.has(code)) return 'file-busy';
  if (FOLDER_MISSING.has(code)) return 'folder-missing';
  if (DISK_ERROR.has(code)) return 'disk-error';
  return 'other';
}

interface ProblemText {
  /** Shown when saving the game failed. Ends by telling the operator what to do. */
  readonly saving: string;
  /** A short reason for one file that could not be copied in (it follows "could not be added: "). */
  readonly copying: string;
}

const TEXT: Record<StorageProblemKind, ProblemText> = {
  'disk-full': {
    saving:
      "The game could not be saved because the computer's disk is full. Free up some space (delete files or empty the Recycle Bin), then press Try again.",
    copying: 'the disk is full',
  },
  'access-denied': {
    saving:
      'The game could not be saved because Windows will not let the app write to its data folder. The folder may be read-only, or another program or a security setting may be blocking it. Press Show data folder to look at it, then press Try again.',
    copying: 'Windows would not let the app write to its data folder',
  },
  'file-busy': {
    saving:
      'The game could not be saved because another program (often antivirus or a backup tool) is using the save file. Wait a moment, then press Try again.',
    copying: 'another program is using the file',
  },
  'folder-missing': {
    saving:
      "The game could not be saved because the app's data folder is missing. It may have been deleted, or its drive removed. Reconnect the drive if there is one, then press Try again.",
    copying: 'the data folder is missing',
  },
  'disk-error': {
    saving:
      'The game could not be saved because the disk reported an error. Press Try again. If it keeps failing, copy your files somewhere safe and have the disk checked.',
    copying: 'the disk reported an error',
  },
  other: {
    saving:
      'The game could not be saved. Press Try again. If it keeps happening, press Show data folder and ask for help.',
    copying: 'it could not be read or copied',
  },
};

/** The message for a failed save of the game. */
export function describeSaveFailure(kind: StorageProblemKind): string {
  return TEXT[kind].saving;
}

/** A short reason a file could not be copied into the app's media folder. */
export function describeCopyFailure(kind: StorageProblemKind): string {
  return TEXT[kind].copying;
}
