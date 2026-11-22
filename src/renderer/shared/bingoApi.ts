/**
 * Typed access to the preload bridge (`window.bingo`).
 *
 * Renderers must go through these accessors; never call window.bingo directly
 * elsewhere. Components receive the API as a prop so tests can pass a fake
 * (see src/renderer/test/fakeBingoApi.ts).
 */
import type { ControllerApi, PresentationApi } from '../../shared/ipc/contract';

declare global {
  interface Window {
    /** Injected by src/preload. Shape depends on the window's role. */
    readonly bingo?: unknown;
  }
}

function requireBridge(): unknown {
  if (!window.bingo) {
    throw new Error(
      'The preload bridge (window.bingo) is missing. This page must be opened by the Electron app, not a browser.',
    );
  }
  return window.bingo;
}

export function getControllerApi(): ControllerApi {
  return requireBridge() as ControllerApi;
}

export function getPresentationApi(): PresentationApi {
  return requireBridge() as PresentationApi;
}
