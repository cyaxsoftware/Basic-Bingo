import path from 'node:path';
import { app, BrowserWindow, type BrowserWindowConstructorOptions } from 'electron';
import { hardenWebContents } from '../security/offlinePolicy';
import { loadRenderer, preloadPath, type WindowRole } from './rendererEntry';

/**
 * Create a window with the app's security baseline. Every BrowserWindow in
 * the app must be created through this function.
 */
export function createAppWindow(role: WindowRole, options: BrowserWindowConstructorOptions): BrowserWindow {
  const window = new BrowserWindow({
    show: false,
    autoHideMenuBar: true,
    // A packaged app already carries its icon in the .exe (see forge.config.mts); only `npm start` needs it.
    ...(app.isPackaged ? {} : { icon: path.join(app.getAppPath(), 'build', 'icon.ico') }),
    ...options,
    webPreferences: {
      preload: preloadPath(role),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
      devTools: !app.isPackaged,
    },
  });
  hardenWebContents(window.webContents);
  window.webContents.on('did-fail-load', (_event, code, description, url) => {
    console.error(`[${role}] failed to load ${url}: ${code} ${description}`);
  });
  window.webContents.on('render-process-gone', (_event, details) => {
    console.error(`[${role}] renderer process gone: ${details.reason}`);
  });
  loadRenderer(window, role).catch((error: unknown) => console.error(`[${role}] load error`, error));
  return window;
}
