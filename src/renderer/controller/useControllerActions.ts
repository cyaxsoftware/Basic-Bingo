import { useCallback, useMemo, useState } from 'react';
import type { CommandResult, ControllerApi } from '../../shared/ipc/contract';
import type { PresentationMode } from '../../shared/presentation/presentationMode';

export interface ControllerActions {
  toggleBall(ball: number): void;
  showBingoBanner(): void;
  dismissBingoBanner(): void;
  /** Clears the game. Callers must have confirmed with the operator first. */
  newGame(): void;
  /** Choose what the projector shows. Never changes the game. */
  setPresentationMode(mode: PresentationMode): void;
  openPresentation(displayId: number): void;
  openPreview(): void;
  closePresentation(): void;
  refreshDisplays(): void;
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
      showBingoBanner: () => run(() => api.showBingoBanner()),
      dismissBingoBanner: () => run(() => api.dismissBingoBanner()),
      newGame: () => run(() => api.newGame()),
      setPresentationMode: (mode: PresentationMode) => run(() => api.setPresentationMode(mode)),
      openPresentation: (displayId: number) => run(() => api.openPresentation(displayId)),
      openPreview: () => run(() => api.openPreview()),
      closePresentation: () => run(() => api.closePresentation()),
      refreshDisplays: () =>
        run(async () => {
          await api.listDisplays();
          return { ok: true };
        }),
      dismissNotice: (noticeId: string) => run(() => api.dismissNotice(noticeId)),
      lastError,
      clearError,
    }),
    [api, run, lastError, clearError],
  );
}
