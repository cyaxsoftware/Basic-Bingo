/**
 * Owns the single Presentation window (audience display).
 *
 * Modes:
 *  - projecting: borderless fullscreen on a chosen display that is not
 *    showing the Controller
 *  - preview:    normal resizable window on the Controller's display, for
 *    rehearsal without a second monitor
 *
 * Status follows the window's real lifecycle:
 *   open requested -> 'opening' -> (ready-to-show) -> 'projecting' | 'preview'
 *   load failure, renderer crash, display lost, or the Controller moving onto
 *   the projected display -> window closed, status 'closed', operator notice.
 *
 * Invariants:
 *  - at most one Presentation window exists
 *  - every event handler is bound to the window it was created for, so an
 *    event from a replaced window can never affect its successor
 *  - closing it never affects the Controller or the game
 *  - a window is never left off-screen or covering the Controller
 */
import type { BrowserWindow, BrowserWindowConstructorOptions, Rectangle } from 'electron';
import { sameBounds } from '../../shared/displays/displaySelection';
import { fail, ok, type CommandResult, type DisplayInfo, type Notice } from '../../shared/ipc/contract';
import type { PresentationService } from '../ipc/registerIpcHandlers';
import type { AppStore } from '../state/appStore';
import type { DisplayManager } from './displayManager';
import type { WindowRegistry } from './windowRegistry';

export const DISPLAY_LOST_NOTICE_ID = 'presentation-display-lost';
export const PRESENTATION_STOPPED_NOTICE_ID = 'presentation-stopped';
const PRESENTATION_BACKGROUND = '#121417';
const PREVIEW_SIZE = { width: 960, height: 540 };
/** Chromium's "navigation aborted" code; not a real load failure. */
const ERR_ABORTED = -3;

type ActiveMode = { kind: 'preview' } | { kind: 'projecting'; displayId: number; bounds: Rectangle };

/** Creates a Presentation window. main.ts passes createAppWindow; tests pass a fake. */
export type PresentationWindowFactory = (options: BrowserWindowConstructorOptions) => BrowserWindow;

export interface PresentationWindowDeps {
  readonly store: AppStore;
  readonly displays: DisplayManager;
  readonly registry: WindowRegistry;
  readonly createWindow: PresentationWindowFactory;
}

export class PresentationWindowManager implements PresentationService {
  private window: BrowserWindow | null = null;
  private mode: ActiveMode | null = null;

  constructor(private readonly deps: PresentationWindowDeps) {}

  openOnDisplay(displayId: number): CommandResult {
    const { store, displays } = this.deps;
    const info = displays.refresh().find((d) => d.id === displayId);
    const display = displays.findDisplay(displayId);
    if (!info || !display) {
      return fail('That display is no longer connected. Choose another display or use Preview.');
    }
    if (info.hostsController) {
      return fail('That display is showing the Controller. Choose a different display, or use Preview.');
    }

    this.destroyWindow();
    const bounds = display.bounds;
    const window = this.deps.createWindow({
      title: 'Basic Bingo — Presentation',
      ...bounds,
      frame: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      backgroundColor: PRESENTATION_BACKGROUND,
    });
    this.attach(window, { kind: 'projecting', displayId, bounds }, () => {
      // Re-apply bounds before going fullscreen: on mixed-DPI setups Windows can
      // resize a window as it is created on another monitor.
      window.setBounds(bounds);
      window.setFullScreen(true);
      // showInactive keeps keyboard focus on the Controller.
      window.showInactive();
      store.setPresentation({ kind: 'projecting', displayId, displayLabel: info.label });
    });
    store.dispatch({ area: 'settings', command: { type: 'setPreferredDisplay', displayId } });
    return ok;
  }

  openPreview(): CommandResult {
    const { store, displays } = this.deps;
    this.destroyWindow();
    const area = displays.controllerDisplay().workArea;
    const width = Math.min(PREVIEW_SIZE.width, area.width);
    const height = Math.min(PREVIEW_SIZE.height, area.height);
    const window = this.deps.createWindow({
      title: 'Basic Bingo — Presentation Preview',
      x: Math.round(area.x + (area.width - width) / 2),
      y: Math.round(area.y + (area.height - height) / 2),
      width,
      height,
      minWidth: 480,
      minHeight: 270,
      backgroundColor: PRESENTATION_BACKGROUND,
    });
    this.attach(window, { kind: 'preview' }, () => {
      window.show();
      store.setPresentation({ kind: 'preview' });
    });
    return ok;
  }

  close(): CommandResult {
    this.destroyWindow();
    return ok;
  }

  /** React to the OS display list changing. */
  handleDisplaysChanged(displays: readonly DisplayInfo[]): void {
    const mode = this.mode;
    if (!this.window || mode?.kind !== 'projecting') return;

    const target = displays.find((d) => d.id === mode.displayId);
    if (!target) {
      const status = this.deps.store.getSnapshot().presentation;
      const label = status.kind === 'projecting' ? status.displayLabel : 'projector';
      this.stop({
        id: DISPLAY_LOST_NOTICE_ID,
        level: 'warning',
        message: `The presentation display (${label}) was disconnected. The game is safe. Choose a display and press Project, or open Preview.`,
      });
      return;
    }

    if (target.hostsController) {
      // A fullscreen window here would cover the operator's screen.
      this.stop({
        id: PRESENTATION_STOPPED_NOTICE_ID,
        level: 'warning',
        message:
          'The Controller is now on the presentation display, so the presentation was closed. Choose another display and press Project, or open Preview.',
      });
      return;
    }

    // Resolution or scaling changed: refit the fullscreen window.
    const live = this.deps.displays.findDisplay(mode.displayId);
    if (live && !sameBounds(live.bounds, mode.bounds)) {
      this.mode = { ...mode, bounds: live.bounds };
      this.window.setFullScreen(false);
      this.window.setBounds(live.bounds);
      this.window.setFullScreen(true);
      if (this.deps.store.getSnapshot().presentation.kind === 'projecting') {
        this.deps.store.setPresentation({
          kind: 'projecting',
          displayId: target.id,
          displayLabel: target.label,
        });
      }
    }
  }

  /**
   * Make `window` the current Presentation and wire its lifecycle. Every handler
   * first checks it still belongs to the current window.
   */
  private attach(window: BrowserWindow, mode: ActiveMode, onReady: () => void): void {
    const { store, registry } = this.deps;
    this.window = window;
    this.mode = mode;
    registry.setPresentation(window);
    store.setPresentation({ kind: 'opening' });
    store.dismissNotice(DISPLAY_LOST_NOTICE_ID);
    store.dismissNotice(PRESENTATION_STOPPED_NOTICE_ID);

    const isCurrent = () => this.window === window;

    window.once('ready-to-show', () => {
      if (isCurrent()) onReady();
    });

    window.webContents.on('did-fail-load', (_event, errorCode, errorDescription, _url, isMainFrame) => {
      if (!isCurrent() || !isMainFrame || errorCode === ERR_ABORTED) return;
      this.stop({
        id: PRESENTATION_STOPPED_NOTICE_ID,
        level: 'error',
        message: `The presentation window failed to load (${errorDescription}). The game is safe. Press Project or Preview to try again.`,
      });
    });

    window.webContents.on('render-process-gone', (_event, details) => {
      if (!isCurrent()) return;
      this.stop({
        id: PRESENTATION_STOPPED_NOTICE_ID,
        level: 'error',
        message: `The presentation window stopped unexpectedly (${details.reason}). The game is safe. Press Project or Preview to reopen it.`,
      });
    });

    window.on('closed', () => {
      // Closed by the user (Alt+F4) or by Windows: just update status.
      if (isCurrent()) this.clear();
    });
  }

  /** Close the current window because something went wrong, and tell the operator. */
  private stop(notice: Notice): void {
    this.destroyWindow();
    this.deps.store.addNotice(notice);
  }

  private destroyWindow(): void {
    const window = this.window;
    if (!window) return;
    this.clear();
    if (!window.isDestroyed()) window.destroy();
  }

  private clear(): void {
    this.window = null;
    this.mode = null;
    this.deps.registry.setPresentation(null);
    this.deps.store.setPresentation({ kind: 'closed' });
  }
}
