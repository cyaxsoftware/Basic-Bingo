/**
 * The IPC contract between the main process and the renderer windows.
 *
 * This file is the single source of truth for channel names and payload types.
 * Main (src/main/ipc), the preload bridges (src/preload) and the renderers
 * (src/renderer/shared/bingoApi.ts) all import from here, so TypeScript catches
 * any drift between them.
 *
 * Rules:
 *  - Renderers never mutate state. They send commands; main validates, applies,
 *    persists and broadcasts a new {@link AppSnapshot}.
 *  - Every snapshot has a strictly increasing `revision`. Renderers ignore any
 *    snapshot whose revision is not newer than the one they already show.
 *  - Command handlers return {@link CommandResult}; they never throw across IPC.
 */
import type { AppState } from '../app/appState';
import type { BallNumber, BingoLetter } from '../game/balls';
import type { FitMode } from '../media/media';
import type { PresentationMode } from '../presentation/presentationMode';
import type { ControllerTheme } from '../theme/controllerTheme';
import type { PatternCells } from '../patterns/pattern';
import type { StorageProblemKind } from '../storage/storageProblem';
import type { SlideshowCommand } from '../media/slideshow';
import type { SlideshowPlaybackCommand } from '../media/slideshowPlayback';

// ---------------------------------------------------------------------------
// Snapshot (main -> renderers)
// ---------------------------------------------------------------------------

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** A Windows display as seen by Electron's `screen` module. */
export interface DisplayInfo {
  /** Electron display id. Not stable across reboots or reconnects; always re-verify. */
  readonly id: number;
  /** Human-readable label for the operator, e.g. "Display 2 (1920×1080)". */
  readonly label: string;
  readonly isPrimary: boolean;
  readonly isInternal: boolean;
  /** True when the Controller window is currently on this display. */
  readonly hostsController: boolean;
  /** Bounds in device-independent pixels. */
  readonly bounds: Rect;
  readonly scaleFactor: number;
}

export type PresentationStatus =
  | { readonly kind: 'closed' }
  /** Window created but not yet ready to show. Never reported as working until it is. */
  | { readonly kind: 'opening' }
  | { readonly kind: 'preview' }
  | { readonly kind: 'projecting'; readonly displayId: number; readonly displayLabel: string };

export type PersistenceStatus =
  | { readonly kind: 'ok' }
  | {
      readonly kind: 'error';
      /** Plain words for the operator: what happened and what to do. Never a path or an internal file name. */
      readonly message: string;
      /** What kind of problem it was (disk full, access denied, ...). */
      readonly problem: StorageProblemKind;
      readonly failedAt: string;
    };

export type NoticeLevel = 'info' | 'warning' | 'error';

/** Operator-facing message shown in the Controller until dismissed. */
/** A button a notice can offer next to Dismiss. */
export type NoticeAction = 'showDataFolder';

export interface Notice {
  /** Stable id; adding a notice with an existing id replaces it. */
  readonly id: string;
  readonly level: NoticeLevel;
  readonly message: string;
  /** Optional recovery action shown with the message. */
  readonly action?: NoticeAction;
}

/**
 * The app state plus the window state, sent to every window after each change (see GLOSSARY.md). The app state
 * fields are described in src/shared/app/appState.ts.
 */
export interface AppSnapshot extends AppState {
  /** Strictly increasing for the lifetime of the main process. */
  readonly revision: number;
  /** Window state: what the Presentation window is doing. Never saved. */
  readonly presentation: PresentationStatus;
  /** Window state: currently connected displays. */
  readonly displays: readonly DisplayInfo[];
  /** Window state: whether the last save worked. */
  readonly persistence: PersistenceStatus;
  /** Window state: messages for the operator. */
  readonly notices: readonly Notice[];
}

// ---------------------------------------------------------------------------
// Commands (renderer -> main)
// ---------------------------------------------------------------------------

export type CommandResult = { readonly ok: true } | { readonly ok: false; readonly error: string };

export const IpcChannel = {
  // Queries (any app window)
  getSnapshot: 'bingo:get-snapshot',
  // Commands (Controller window only)
  toggleBall: 'bingo:toggle-ball',
  toggleRowDisabled: 'bingo:toggle-row-disabled',
  showBingoBanner: 'bingo:show-bingo-banner',
  dismissBingoBanner: 'bingo:dismiss-bingo-banner',
  newGame: 'bingo:new-game',
  setPresentationMode: 'bingo:set-presentation-mode',
  setControllerTheme: 'bingo:set-controller-theme',
  clearGameLog: 'bingo:clear-game-log',
  retrySave: 'bingo:retry-save',
  showDataFolder: 'bingo:show-data-folder',
  selectPattern: 'bingo:select-pattern',
  setActivePatternCell: 'bingo:set-active-pattern-cell',
  renameActivePattern: 'bingo:rename-active-pattern',
  updateSavedPattern: 'bingo:update-saved-pattern',
  saveActivePatternAsNew: 'bingo:save-active-pattern-as-new',
  createPattern: 'bingo:create-pattern',
  renamePattern: 'bingo:rename-pattern',
  duplicatePattern: 'bingo:duplicate-pattern',
  deletePattern: 'bingo:delete-pattern',
  showPatternOnProjector: 'bingo:show-pattern-on-projector',
  hidePatternOnProjector: 'bingo:hide-pattern-on-projector',
  importImages: 'bingo:import-images',
  importPowerPoint: 'bingo:import-powerpoint',
  importSlideshowImages: 'bingo:import-slideshow-images',
  selectSingleImage: 'bingo:select-single-image',
  setImageFit: 'bingo:set-image-fit',
  removeImage: 'bingo:remove-image',
  setTimerDuration: 'bingo:set-timer-duration',
  setCountdownMessage: 'bingo:set-countdown-message',
  startTimer: 'bingo:start-timer',
  pauseTimer: 'bingo:pause-timer',
  resumeTimer: 'bingo:resume-timer',
  resetTimer: 'bingo:reset-timer',
  editSlideshow: 'bingo:edit-slideshow',
  controlSlideshow: 'bingo:control-slideshow',
  listDisplays: 'bingo:list-displays',
  openPresentation: 'bingo:open-presentation',
  openPreview: 'bingo:open-preview',
  closePresentation: 'bingo:close-presentation',
  dismissNotice: 'bingo:dismiss-notice',
  // Events (main -> renderers)
  snapshotUpdated: 'bingo:snapshot-updated',
} as const;

export type IpcChannelName = (typeof IpcChannel)[keyof typeof IpcChannel];

export type Unsubscribe = () => void;

/** API exposed to the read-only Presentation window as `window.bingo`. */
export interface PresentationApi {
  getSnapshot(): Promise<AppSnapshot>;
  onSnapshot(listener: (snapshot: AppSnapshot) => void): Unsubscribe;
}

/** API exposed to the Controller window as `window.bingo`. */
export interface ControllerApi extends PresentationApi {
  toggleBall(ball: BallNumber): Promise<CommandResult>;
  /** Black out (or restore) a row the game does not use. Visual only; calls are unaffected. */
  toggleRowDisabled(letter: BingoLetter): Promise<CommandResult>;
  /** Raise the BINGO CALLED banner (idempotent). It stays until dismissed or a new game starts. */
  showBingoBanner(): Promise<CommandResult>;
  /** Hide the banner. Never changes the calls. */
  dismissBingoBanner(): Promise<CommandResult>;
  /** Clear all calls and the banner. The caller is responsible for confirming with the operator. */
  newGame(): Promise<CommandResult>;
  /** Choose what the audience display shows. Never changes the game. */
  setPresentationMode(mode: PresentationMode): Promise<CommandResult>;
  /** Switch the Controller between its light and dark colours. Never changes the game or the projector. */
  setControllerTheme(theme: ControllerTheme): Promise<CommandResult>;
  /** Empty the games-played history. The caller is responsible for confirming with the operator. */
  clearGameLog(): Promise<CommandResult>;
  /** Try to save the game again after a failed save (a full disk, a locked folder). */
  retrySave(): Promise<CommandResult>;
  /** Open the app's data folder in Windows Explorer, for support. */
  showDataFolder(): Promise<CommandResult>;
  /** Show a library pattern: replaces the working copy with a fresh, unedited copy of it. */
  selectPattern(patternId: string): Promise<CommandResult>;
  /** Set one cell (0 to 24, the center included) of the working copy on or off. Never changes the library. */
  setActivePatternCell(index: number, on: boolean): Promise<CommandResult>;
  /** Rename the working copy (not the saved pattern). */
  renameActivePattern(title: string): Promise<CommandResult>;
  /** Write the working copy back into the saved pattern it came from. */
  updateSavedPattern(): Promise<CommandResult>;
  /** Save the working copy as a new library pattern (default title: its current title). */
  saveActivePatternAsNew(title?: string): Promise<CommandResult>;
  createPattern(title: string, cells: PatternCells): Promise<CommandResult>;
  renamePattern(patternId: string, title: string): Promise<CommandResult>;
  duplicatePattern(patternId: string): Promise<CommandResult>;
  /** The caller must have confirmed with the operator first. */
  deletePattern(patternId: string): Promise<CommandResult>;
  /** Push the working pattern (title and cells) to the projector. Later edits do not change it until pushed again. */
  showPatternOnProjector(): Promise<CommandResult>;
  /** Remove the pattern from the projector. */
  hidePatternOnProjector(): Promise<CommandResult>;
  /** Open the file dialog and copy the chosen images into the media library. Resolves when it is done. */
  importImages(): Promise<CommandResult>;
  importPowerPoint(collectionId: string): Promise<CommandResult>;
  importSlideshowImages(collectionId: string): Promise<CommandResult>;
  /** Show a library image in Single Image mode (null: none). */
  selectSingleImage(mediaId: string | null): Promise<CommandResult>;
  /** Set how one image meets the screen. Each image remembers its own Fit or Fill. */
  setImageFit(mediaId: string, fit: FitMode): Promise<CommandResult>;
  /** Delete an image from the library and its stored file. */
  removeImage(mediaId: string): Promise<CommandResult>;
  setTimerDuration(durationSeconds: number): Promise<CommandResult>;
  setCountdownMessage(message: string): Promise<CommandResult>;
  startTimer(): Promise<CommandResult>;
  pauseTimer(): Promise<CommandResult>;
  resumeTimer(): Promise<CommandResult>;
  resetTimer(): Promise<CommandResult>;
  editSlideshow(command: SlideshowCommand): Promise<CommandResult>;
  controlSlideshow(command: SlideshowPlaybackCommand): Promise<CommandResult>;
  /** Re-reads displays from Windows and returns them (the snapshot updates too). */
  listDisplays(): Promise<readonly DisplayInfo[]>;
  openPresentation(displayId: number): Promise<CommandResult>;
  openPreview(): Promise<CommandResult>;
  closePresentation(): Promise<CommandResult>;
  dismissNotice(noticeId: string): Promise<CommandResult>;
}

export const ok: CommandResult = Object.freeze({ ok: true });

export function fail(error: string): CommandResult {
  return { ok: false, error };
}
