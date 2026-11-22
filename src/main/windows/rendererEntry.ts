/**
 * Where each window's HTML and preload script live, in development and in a
 * packaged build. The *_VITE_* globals are injected by Forge's Vite plugin.
 */
import path from 'node:path';
import type { BrowserWindow } from 'electron';

export type WindowRole = 'controller' | 'presentation';

interface RendererEntry {
  /** Vite dev server URL while running `npm start`; undefined when packaged. */
  readonly devServerUrl: string | undefined;
  /** Folder name under .vite/renderer/ in a build. */
  readonly name: string;
  /** Preload bundle file name next to main.cjs. */
  readonly preload: string;
}

// `typeof` guards keep this safe whether or not Vite substituted the constant.
const ENTRIES: Record<WindowRole, RendererEntry> = {
  controller: {
    devServerUrl:
      typeof CONTROLLER_WINDOW_VITE_DEV_SERVER_URL === 'undefined'
        ? undefined
        : CONTROLLER_WINDOW_VITE_DEV_SERVER_URL,
    name: CONTROLLER_WINDOW_VITE_NAME,
    preload: 'controllerPreload.cjs',
  },
  presentation: {
    devServerUrl:
      typeof PRESENTATION_WINDOW_VITE_DEV_SERVER_URL === 'undefined'
        ? undefined
        : PRESENTATION_WINDOW_VITE_DEV_SERVER_URL,
    name: PRESENTATION_WINDOW_VITE_NAME,
    preload: 'presentationPreload.cjs',
  },
};

export function preloadPath(role: WindowRole): string {
  return path.join(__dirname, ENTRIES[role].preload);
}

export function loadRenderer(window: BrowserWindow, role: WindowRole): Promise<void> {
  const entry = ENTRIES[role];
  if (entry.devServerUrl) return window.loadURL(entry.devServerUrl);
  return window.loadFile(path.join(__dirname, `../renderer/${entry.name}/index.html`));
}

/** Dev server origins that the offline policy must allow while developing. */
export function devServerOrigins(): string[] {
  return Object.values(ENTRIES)
    .map((e) => e.devServerUrl)
    .filter((url): url is string => Boolean(url))
    .map((url) => new URL(url).origin);
}
