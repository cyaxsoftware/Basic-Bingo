/**
 * Owns the single Presentation window (audience display).
 *
 * Modes:
 *  - projecting: borderless fullscreen on a chosen display that is not
 *    showing the Controller
 *  - preview:    normal resizable window on the Controller's display, for
 *    rehearsal without a second monitor
 *
 * Invariants:
 *  - at most one Presentation window exists
 *  - closing it never affects the Controller or the game
 *  - if its display disappears it is closed (never left off-screen) and the
 *    operator is warned
 */
import type { BrowserWindow, Rectangle } from 'electron';
import { fail, ok, type CommandResult, type DisplayInfo } from '../../shared/ipc/contract';
import type { PresentationService } from '../ipc/registerIpcHandlers';
import type { AppStore } from '../state/appStore';
import { createAppWindow } from './createAppWindow';
import type { DisplayManager } from './displayManager';
import { sameBounds } from '../../shared/displays/displaySelection';
import type { WindowRegistry } from './windowRegistry';

export const DISPLAY_LOST_NOTICE_ID = 'presentation-display-lost';
const PRESENTATION_BACKGROUND = '#121417';
const PREVIEW_SIZE = { width: 960, height: 540 };

type ActiveMode = { kind: 'preview' } | { kind: 'projecting'; displayId: number; bounds: Rectangle };

export interface PresentationWindowDeps {
  readonly store: AppStore;
  readonly displays: DisplayManager;
  readonly registry: WindowRegistry;
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
    const window = createAppWindow('presentation', {
      title: 'Offline Bingo Display — Presentation',
      ...bounds,
      frame: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      backgroundColor: PRESENTATION_BACKGROUND,
    });
    window.once('ready-to-show', () => {
      // Re-apply bounds before going fullscreen: on mixed-DPI setups Windows can
      // resize a window as it is created on another monitor.
      window.setBounds(bounds);
      window.setFullScreen(true);
      // showInactive keeps keyboard focus on the Controller.
      window.showInactive();
    });
    this.attach(window, { kind: 'projecting', displayId, bounds });

    store.setPresentation({ kind: 'projecting', displayId, displayLabel: info.label });
    store.setPreferredDisplay(displayId);
    store.dismissNotice(DISPLAY_LOST_NOTICE_ID);
    return ok;
  }

  openPreview(): CommandResult {
    const { store, displays } = this.deps;
    this.destroyWindow();
    const area = displays.controllerDisplay().workArea;
    const width = Math.min(PREVIEW_SIZE.width, area.width);
    const height = Math.min(PREVIEW_SIZE.height, area.height);
    const window = createAppWindow('presentation', {
      title: 'Offline Bingo Display — Presentation Preview',
      x: Math.round(area.x + (area.width - width) / 2),
      y: Math.round(area.y + (area.height - height) / 2),
      width,
      height,
      minWidth: 480,
      minHeight: 270,
      backgroundColor: PRESENTATION_BACKGROUND,
    });
    window.once('ready-to-show', () => window.show());
    this.attach(window, { kind: 'preview' });

    store.setPresentation({ kind: 'preview' });
    store.dismissNotice(DISPLAY_LOST_NOTICE_ID);
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
      this.destroyWindow();
      this.deps.store.addNotice({
        id: DISPLAY_LOST_NOTICE_ID,
        level: 'warning',
        message: `The presentation display (${label}) was disconnected. The game is safe. Choose a display and press Project, or open Preview.`,
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
      this.deps.store.setPresentation({
        kind: 'projecting',
        displayId: target.id,
        displayLabel: target.label,
      });
    }
  }

  private attach(window: BrowserWindow, mode: ActiveMode): void {
    this.window = window;
    this.mode = mode;
    this.deps.registry.setPresentation(window);
    window.on('closed', () => {
      // Closed by the user (Alt+F4) or by Windows: just update status.
      if (this.window === window) this.clear();
    });
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
