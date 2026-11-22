/**
 * Builds the `window.bingo` bridge objects. Shared by both preload entries.
 *
 * Only named, typed functions are exposed. Raw ipcRenderer, Node APIs and
 * arbitrary channels are never reachable from renderer code.
 */
import { ipcRenderer, type IpcRendererEvent } from 'electron';
import {
  IpcChannel,
  type AppSnapshot,
  type ControllerApi,
  type PresentationApi,
} from '../shared/ipc/contract';

export function createPresentationApi(): PresentationApi {
  return {
    getSnapshot: () => ipcRenderer.invoke(IpcChannel.getSnapshot) as Promise<AppSnapshot>,
    onSnapshot: (listener) => {
      // Wrap so the renderer never receives the IpcRendererEvent (it exposes `sender`).
      const handler = (_event: IpcRendererEvent, snapshot: AppSnapshot) => listener(snapshot);
      ipcRenderer.on(IpcChannel.snapshotUpdated, handler);
      return () => {
        ipcRenderer.removeListener(IpcChannel.snapshotUpdated, handler);
      };
    },
  };
}

export function createControllerApi(): ControllerApi {
  return {
    ...createPresentationApi(),
    toggleBall: (ball) => ipcRenderer.invoke(IpcChannel.toggleBall, ball),
    listDisplays: () => ipcRenderer.invoke(IpcChannel.listDisplays),
    openPresentation: (displayId) => ipcRenderer.invoke(IpcChannel.openPresentation, displayId),
    openPreview: () => ipcRenderer.invoke(IpcChannel.openPreview),
    closePresentation: () => ipcRenderer.invoke(IpcChannel.closePresentation),
    dismissNotice: (noticeId) => ipcRenderer.invoke(IpcChannel.dismissNotice, noticeId),
  };
}

/** Global name of the bridge in every renderer. Keep in sync with src/renderer/shared/bingoApi.ts. */
export const BRIDGE_KEY = 'bingo';
