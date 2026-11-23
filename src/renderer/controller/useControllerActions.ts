import { useCallback, useMemo, useState } from 'react';
import type { BingoLetter } from '../../shared/game/balls';
import type { FitMode } from '../../shared/media';
import type { SlideshowCommand } from '../../shared/media/slideshow';
import type { CommandResult, ControllerApi } from '../../shared/ipc/contract';
import type { PresentationMode } from '../../shared/presentation/presentationMode';

export type UnsavedEdits = 'update' | 'saveAsNew' | 'discard';

/** The title and cells of the pattern "New pattern" makes: every square off (there is no free space). */
export const NEW_PATTERN_TITLE = 'New pattern';
const BLANK_PATTERN_CELLS: readonly boolean[] = Array.from({ length: 25 }, () => false);

export interface ControllerActions {
  toggleBall(ball: number): void;
  /** Black out (or restore) a row this game does not use. Visual only. */
  toggleRow(letter: BingoLetter): void;
  showBingoBanner(): void;
  dismissBingoBanner(): void;
  /** Clears the game. Callers must have confirmed with the operator first. */
  newGame(): void;
  /** Choose what the projector shows. Never changes the game. */
  setPresentationMode(mode: PresentationMode): void;
  /** What to do with unsaved edits to the working pattern before switching to another one. */
  switchPattern(patternId: string, unsavedEdits: UnsavedEdits): void;
  setPatternCell(index: number, on: boolean): void;
  renameActivePattern(title: string): void;
  updateSavedPattern(): void;
  saveActivePatternAsNew(): void;
  /** Make a new blank saved pattern and switch to it, first saving or discarding unsaved edits. */
  createBlankPattern(unsavedEdits: UnsavedEdits): void;
  /** Rename a saved pattern; with `followCopy`, the unedited working copy takes the new name too. */
  renameSavedPattern(patternId: string, title: string, followCopy: boolean): void;
  duplicatePattern(patternId: string): void;
  deletePattern(patternId: string): void;
  /** Push the working pattern to the projector (a snapshot; later edits wait for the next push). */
  showPatternOnProjector(): void;
  hidePatternOnProjector(): void;
  /** Open the file dialog and add the chosen images to the library. */
  importImages(): void;
  importSlideshowImages(collectionId: string): void;
  selectSingleImage(mediaId: string | null): void;
  /** Set how one image meets the screen; each image keeps its own. */
  setImageFit(mediaId: string, fit: FitMode): void;
  removeImage(mediaId: string): void;
  setTimerDuration(durationSeconds: number): void;
  setCountdownMessage(message: string): void;
  startTimer(): void;
  pauseTimer(): void;
  resumeTimer(): void;
  resetTimer(): void;
  editSlideshow(command: SlideshowCommand): void;
  openPresentation(displayId: number): void;
  openPreview(): void;
  closePresentation(): void;
  dismissNotice(noticeId: string): void;
  /** Message from the last failed command, shown until cleared or the next success. */
  readonly lastError: string | null;
  clearError(): void;
}

/**
 * Wraps the bridge so components just call actions. Results arrive as new
 * snapshots; this hook only tracks failures to show the operator.
 */
export function useControllerActions(api: ControllerApi): ControllerActions {
  const [lastError, setLastError] = useState<string | null>(null);

  const run = useCallback((command: () => Promise<CommandResult>) => {
    command().then(
      (result) => setLastError(result.ok ? null : result.error),
      (error: unknown) => setLastError(error instanceof Error ? error.message : String(error)),
    );
  }, []);

  const clearError = useCallback(() => setLastError(null), []);

  return useMemo(
    () => ({
      toggleBall: (ball: number) => run(() => api.toggleBall(ball)),
      toggleRow: (letter: BingoLetter) => run(() => api.toggleRowDisabled(letter)),
      showBingoBanner: () => run(() => api.showBingoBanner()),
      dismissBingoBanner: () => run(() => api.dismissBingoBanner()),
      newGame: () => run(() => api.newGame()),
      setPresentationMode: (mode: PresentationMode) => run(() => api.setPresentationMode(mode)),
      // Save first, then switch; if the save fails the switch does not happen, so no edits are lost.
      switchPattern: (patternId: string, unsavedEdits: UnsavedEdits) =>
        run(async () => {
          if (unsavedEdits !== 'discard') {
            const saved =
              unsavedEdits === 'update' ? await api.updateSavedPattern() : await api.saveActivePatternAsNew();
            if (!saved.ok) return saved;
          }
          return api.selectPattern(patternId);
        }),
      setPatternCell: (index: number, on: boolean) => run(() => api.setActivePatternCell(index, on)),
      renameActivePattern: (title: string) => run(() => api.renameActivePattern(title)),
      updateSavedPattern: () => run(() => api.updateSavedPattern()),
      saveActivePatternAsNew: () => run(() => api.saveActivePatternAsNew()),
      // Create, then find the new pattern (the one that was not there before) and switch to it. Unsaved edits are
      // saved first if asked; if that fails, nothing else happens, so no edits are lost.
      createBlankPattern: (unsavedEdits: UnsavedEdits) =>
        run(async () => {
          if (unsavedEdits !== 'discard') {
            const saved =
              unsavedEdits === 'update' ? await api.updateSavedPattern() : await api.saveActivePatternAsNew();
            if (!saved.ok) return saved;
          }
          const before = new Set((await api.getSnapshot()).patternLibrary.map((pattern) => pattern.id));
          const created = await api.createPattern(NEW_PATTERN_TITLE, BLANK_PATTERN_CELLS);
          if (!created.ok) return created;
          const added = (await api.getSnapshot()).patternLibrary.find((pattern) => !before.has(pattern.id));
          return added ? api.selectPattern(added.id) : created;
        }),
      renameSavedPattern: (patternId: string, title: string, followCopy: boolean) =>
        run(async () => {
          const renamed = await api.renamePattern(patternId, title);
          return renamed.ok && followCopy ? api.renameActivePattern(title) : renamed;
        }),
      duplicatePattern: (patternId: string) => run(() => api.duplicatePattern(patternId)),
      deletePattern: (patternId: string) => run(() => api.deletePattern(patternId)),
      showPatternOnProjector: () => run(() => api.showPatternOnProjector()),
      hidePatternOnProjector: () => run(() => api.hidePatternOnProjector()),
      importImages: () => run(() => api.importImages()),
      importSlideshowImages: (collectionId: string) => run(() => api.importSlideshowImages(collectionId)),
      selectSingleImage: (mediaId: string | null) => run(() => api.selectSingleImage(mediaId)),
      setImageFit: (mediaId: string, fit: FitMode) => run(() => api.setImageFit(mediaId, fit)),
      removeImage: (mediaId: string) => run(() => api.removeImage(mediaId)),
      setTimerDuration: (durationSeconds: number) => run(() => api.setTimerDuration(durationSeconds)),
      setCountdownMessage: (message: string) => run(() => api.setCountdownMessage(message)),
      startTimer: () => run(() => api.startTimer()),
      pauseTimer: () => run(() => api.pauseTimer()),
      resumeTimer: () => run(() => api.resumeTimer()),
      resetTimer: () => run(() => api.resetTimer()),
      editSlideshow: (command: SlideshowCommand) => run(() => api.editSlideshow(command)),
      openPresentation: (displayId: number) => run(() => api.openPresentation(displayId)),
      openPreview: () => run(() => api.openPreview()),
      closePresentation: () => run(() => api.closePresentation()),
      dismissNotice: (noticeId: string) => run(() => api.dismissNotice(noticeId)),
      lastError,
      clearError,
    }),
    [api, run, lastError, clearError],
  );
}
