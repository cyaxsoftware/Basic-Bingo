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
    toggleRowDisabled: (letter) => ipcRenderer.invoke(IpcChannel.toggleRowDisabled, letter),
    showBingoBanner: () => ipcRenderer.invoke(IpcChannel.showBingoBanner),
    dismissBingoBanner: () => ipcRenderer.invoke(IpcChannel.dismissBingoBanner),
    newGame: () => ipcRenderer.invoke(IpcChannel.newGame),
    setPresentationMode: (mode) => ipcRenderer.invoke(IpcChannel.setPresentationMode, mode),
    selectPattern: (patternId) => ipcRenderer.invoke(IpcChannel.selectPattern, patternId),
    setActivePatternCell: (index, on) => ipcRenderer.invoke(IpcChannel.setActivePatternCell, index, on),
    renameActivePattern: (title) => ipcRenderer.invoke(IpcChannel.renameActivePattern, title),
    updateSavedPattern: () => ipcRenderer.invoke(IpcChannel.updateSavedPattern),
    saveActivePatternAsNew: (title) => ipcRenderer.invoke(IpcChannel.saveActivePatternAsNew, title),
    createPattern: (title, cells) => ipcRenderer.invoke(IpcChannel.createPattern, title, cells),
    renamePattern: (patternId, title) => ipcRenderer.invoke(IpcChannel.renamePattern, patternId, title),
    duplicatePattern: (patternId) => ipcRenderer.invoke(IpcChannel.duplicatePattern, patternId),
    deletePattern: (patternId) => ipcRenderer.invoke(IpcChannel.deletePattern, patternId),
    showPatternOnProjector: () => ipcRenderer.invoke(IpcChannel.showPatternOnProjector),
    hidePatternOnProjector: () => ipcRenderer.invoke(IpcChannel.hidePatternOnProjector),
    importImages: () => ipcRenderer.invoke(IpcChannel.importImages),
    selectSingleImage: (mediaId) => ipcRenderer.invoke(IpcChannel.selectSingleImage, mediaId),
    setImageFit: (mediaId, fit) => ipcRenderer.invoke(IpcChannel.setImageFit, mediaId, fit),
    removeImage: (mediaId) => ipcRenderer.invoke(IpcChannel.removeImage, mediaId),
    setTimerDuration: (durationSeconds) => ipcRenderer.invoke(IpcChannel.setTimerDuration, durationSeconds),
    setCountdownMessage: (message) => ipcRenderer.invoke(IpcChannel.setCountdownMessage, message),
    startTimer: () => ipcRenderer.invoke(IpcChannel.startTimer),
    pauseTimer: () => ipcRenderer.invoke(IpcChannel.pauseTimer),
    resumeTimer: () => ipcRenderer.invoke(IpcChannel.resumeTimer),
    resetTimer: () => ipcRenderer.invoke(IpcChannel.resetTimer),
    listDisplays: () => ipcRenderer.invoke(IpcChannel.listDisplays),
    openPresentation: (displayId) => ipcRenderer.invoke(IpcChannel.openPresentation, displayId),
    openPreview: () => ipcRenderer.invoke(IpcChannel.openPreview),
    closePresentation: () => ipcRenderer.invoke(IpcChannel.closePresentation),
    dismissNotice: (noticeId) => ipcRenderer.invoke(IpcChannel.dismissNotice, noticeId),
  };
}

/** Global name of the bridge in every renderer. Keep in sync with src/renderer/shared/bingoApi.ts. */
export const BRIDGE_KEY = 'bingo';
