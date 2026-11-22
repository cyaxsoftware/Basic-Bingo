/**
 * Offline and navigation policy.
 *
 * The app must work with no network at all, so it should never *try* to use
 * one: any request that is not a local app resource is cancelled. This also
 * makes accidental remote dependencies (a CDN script, a web font) fail loudly
 * during development instead of silently at a bingo hall with no Wi-Fi.
 */
import type { Session, WebContents } from 'electron';

const ALWAYS_ALLOWED_PROTOCOLS = new Set(['file:', 'devtools:', 'data:', 'blob:', 'chrome-extension:']);

/**
 * Pure decision function. `devOrigins` are http origins of the Vite dev
 * server(s); their ws:// equivalents are allowed too for hot reload.
 */
export function isRequestAllowed(url: string, devOrigins: readonly string[]): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (ALWAYS_ALLOWED_PROTOCOLS.has(parsed.protocol)) return true;
  const httpOrigin = parsed.origin.replace(/^ws(s?):/, 'http$1:');
  return devOrigins.includes(httpOrigin);
}

export function installOfflinePolicy(session: Session, devOrigins: readonly string[]): void {
  session.webRequest.onBeforeRequest((details, callback) => {
    const allowed = isRequestAllowed(details.url, devOrigins);
    if (!allowed) console.warn(`[offline-policy] blocked request to ${details.url}`);
    callback({ cancel: !allowed });
  });
  // No renderer needs camera, microphone, notifications, etc.
  session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  session.setPermissionCheckHandler(() => false);
}

/** Lock a window to its own page: no popups, no navigation away, no pinch zoom. */
export function hardenWebContents(webContents: WebContents): void {
  webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  webContents.on('will-navigate', (event, url) => {
    const current = webContents.getURL();
    if (!current || new URL(url).origin !== new URL(current).origin) event.preventDefault();
  });
  webContents.on('will-attach-webview', (event) => event.preventDefault());
  // Touchscreens: a stray pinch must not zoom the Controller. Must be applied
  // after each load; calling it before the first frame exists rejects.
  webContents.on('did-finish-load', () => {
    webContents.setVisualZoomLevelLimits(1, 1).catch((error: unknown) => {
      console.warn('[harden] could not disable pinch zoom', error);
    });
  });
}
