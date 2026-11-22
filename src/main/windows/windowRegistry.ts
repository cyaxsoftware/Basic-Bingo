/**
 * Tracks the app's windows so IPC can verify senders and snapshots can be
 * broadcast. webContents ids are captured when a window is registered because
 * reading them from a destroyed window throws.
 */
import type { BrowserWindow } from 'electron';
import { IpcChannel, type AppSnapshot } from '../../shared/ipc/contract';
import type { SenderPolicy } from '../ipc/registerIpcHandlers';

interface Tracked {
  readonly window: BrowserWindow;
  readonly webContentsId: number;
}

export class WindowRegistry implements SenderPolicy {
  private controller: Tracked | null = null;
  private presentation: Tracked | null = null;

  setController(window: BrowserWindow | null): void {
    this.controller = window ? { window, webContentsId: window.webContents.id } : null;
  }

  setPresentation(window: BrowserWindow | null): void {
    this.presentation = window ? { window, webContentsId: window.webContents.id } : null;
  }

  getController(): BrowserWindow | null {
    return liveWindow(this.controller);
  }

  getPresentation(): BrowserWindow | null {
    return liveWindow(this.presentation);
  }

  isController(webContentsId: number): boolean {
    return this.controller?.webContentsId === webContentsId;
  }

  isAppWindow(webContentsId: number): boolean {
    return this.isController(webContentsId) || this.presentation?.webContentsId === webContentsId;
  }

  broadcast(snapshot: AppSnapshot): void {
    for (const window of [this.getController(), this.getPresentation()]) {
      if (window && !window.webContents.isDestroyed()) {
        window.webContents.send(IpcChannel.snapshotUpdated, snapshot);
      }
    }
  }
}

function liveWindow(tracked: Tracked | null): BrowserWindow | null {
  return tracked && !tracked.window.isDestroyed() ? tracked.window : null;
}
