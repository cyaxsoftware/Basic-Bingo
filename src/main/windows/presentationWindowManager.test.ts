import { EventEmitter } from 'node:events';
import type { BrowserWindow, Display, Rectangle } from 'electron';
import { beforeEach, describe, expect, it } from 'vitest';
import { createDefaultAppData } from '../persistence/persistedState';
import { AppStore } from '../state/appStore';
import { DisplayManager, type ScreenLike } from './displayManager';
import {
  DISPLAY_LOST_NOTICE_ID,
  PRESENTATION_STOPPED_NOTICE_ID,
  PresentationWindowManager,
} from './presentationWindowManager';
import { WindowRegistry } from './windowRegistry';

// ---------------------------------------------------------------------------
// Fakes: just enough of Electron's BrowserWindow and Screen for the manager.
// ---------------------------------------------------------------------------

let nextWebContentsId = 100;

class FakeWindow extends EventEmitter {
  readonly webContents = Object.assign(new EventEmitter(), {
    id: nextWebContentsId++,
    send: () => undefined,
    isDestroyed: () => this.destroyed,
  });
  destroyed = false;
  shown = false;
  fullScreen = false;
  bounds: Rectangle | null = null;
  setBounds(b: Rectangle) {
    this.bounds = b;
  }
  setFullScreen(value: boolean) {
    this.fullScreen = value;
  }
  show() {
    this.shown = true;
  }
  showInactive() {
    this.shown = true;
  }
  isDestroyed() {
    return this.destroyed;
  }
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.emit('closed');
  }
  /** Simulate Chromium events. */
  ready() {
    this.emit('ready-to-show');
  }
  failLoad(code = -105, isMainFrame = true) {
    this.webContents.emit('did-fail-load', {}, code, 'ERR_NAME_NOT_RESOLVED', 'file:///x', isMainFrame);
  }
  crash() {
    this.webContents.emit('render-process-gone', {}, { reason: 'crashed', exitCode: 1 });
  }
}

function display(id: number, x: number, label: string, internal = false): Display {
  const bounds = { x, y: 0, width: 1920, height: 1080 };
  return { id, label, bounds, workArea: bounds, scaleFactor: 1, internal } as unknown as Display;
}

class FakeScreen extends EventEmitter {
  displays: Display[] = [display(1, 0, 'Laptop', true), display(2, 1920, 'Projector')];
  getAllDisplays = () => this.displays;
  getPrimaryDisplay = () => this.displays[0]!;
  getDisplayMatching = (rect: Rectangle) =>
    this.displays.find((d) => rect.x >= d.bounds.x && rect.x < d.bounds.x + d.bounds.width) ??
    this.displays[0]!;
}

function setup() {
  const screen = new FakeScreen();
  let controllerBounds: Rectangle = { x: 100, y: 100, width: 1280, height: 800 }; // on the laptop
  const displays = new DisplayManager(screen as unknown as ScreenLike, () => controllerBounds);
  const store = new AppStore({
    initialData: createDefaultAppData(),
    persister: { save: async () => undefined },
  });
  const registry = new WindowRegistry();
  const windows: FakeWindow[] = [];
  const manager = new PresentationWindowManager({
    store,
    displays,
    registry,
    createWindow: () => {
      const window = new FakeWindow();
      windows.push(window);
      return window as unknown as BrowserWindow;
    },
  });
  displays.start((list) => {
    store.setDisplays(list);
    manager.handleDisplaysChanged(list);
  });
  return {
    store,
    manager,
    windows,
    screen,
    displays,
    registry,
    moveController: (bounds: Rectangle) => (controllerBounds = bounds),
    status: () => store.getSnapshot().presentation,
    noticeIds: () => store.getSnapshot().notices.map((n) => n.id),
  };
}

describe('PresentationWindowManager lifecycle (audit finding 3, #20)', () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  it('reports "opening" until the window is ready, then "projecting"', () => {
    expect(ctx.manager.openOnDisplay(2)).toEqual({ ok: true });
    const [window] = ctx.windows;
    expect(ctx.status()).toEqual({ kind: 'opening' });
    expect(window!.shown).toBe(false);

    window!.ready();
    expect(ctx.status()).toEqual({ kind: 'projecting', displayId: 2, displayLabel: 'Projector — 1920×1080' });
    expect(window!.fullScreen).toBe(true);
    expect(window!.shown).toBe(true);
  });

  it('reports "preview" only once the preview window is ready', () => {
    ctx.manager.openPreview();
    expect(ctx.status()).toEqual({ kind: 'opening' });
    ctx.windows[0]!.ready();
    expect(ctx.status()).toEqual({ kind: 'preview' });
  });

  it('closes the window and warns when the page fails to load', () => {
    ctx.manager.openOnDisplay(2);
    const [window] = ctx.windows;
    window!.failLoad();
    expect(window!.destroyed).toBe(true);
    expect(ctx.status()).toEqual({ kind: 'closed' });
    expect(ctx.noticeIds()).toContain(PRESENTATION_STOPPED_NOTICE_ID);
  });

  it('ignores aborted navigations and sub-frame failures', () => {
    ctx.manager.openOnDisplay(2);
    const [window] = ctx.windows;
    window!.failLoad(-3);
    window!.failLoad(-105, false);
    expect(window!.destroyed).toBe(false);
    expect(ctx.status()).toEqual({ kind: 'opening' });
  });

  it('closes the window and warns when its renderer crashes', () => {
    ctx.manager.openOnDisplay(2);
    const [window] = ctx.windows;
    window!.ready();
    window!.crash();
    expect(window!.destroyed).toBe(true);
    expect(ctx.status()).toEqual({ kind: 'closed' });
    expect(ctx.store.getSnapshot().notices.at(-1)?.message).toMatch(/stopped unexpectedly \(crashed\)/);
  });

  it('closes the projector when the Controller moves onto that display', () => {
    ctx.manager.openOnDisplay(2);
    ctx.windows[0]!.ready();
    ctx.moveController({ x: 2000, y: 100, width: 1280, height: 800 });
    ctx.displays.refresh();
    expect(ctx.windows[0]!.destroyed).toBe(true);
    expect(ctx.status()).toEqual({ kind: 'closed' });
    expect(ctx.noticeIds()).toContain(PRESENTATION_STOPPED_NOTICE_ID);
  });

  it('closes the projector and warns when its display is unplugged', () => {
    ctx.manager.openOnDisplay(2);
    ctx.windows[0]!.ready();
    ctx.screen.displays = ctx.screen.displays.filter((d) => d.id !== 2);
    ctx.displays.refresh();
    expect(ctx.windows[0]!.destroyed).toBe(true);
    expect(ctx.status()).toEqual({ kind: 'closed' });
    expect(ctx.noticeIds()).toContain(DISPLAY_LOST_NOTICE_ID);
  });

  it('ignores events from a replaced window', () => {
    ctx.manager.openPreview();
    const [preview] = ctx.windows;
    ctx.manager.openOnDisplay(2);
    const projector = ctx.windows[1]!;
    expect(preview!.destroyed).toBe(true);

    // Late events from the old preview must not touch the new projector.
    preview!.ready();
    expect(ctx.status()).toEqual({ kind: 'opening' });
    preview!.crash();
    preview!.failLoad();
    expect(projector.destroyed).toBe(false);
    expect(ctx.noticeIds()).not.toContain(PRESENTATION_STOPPED_NOTICE_ID);

    projector.ready();
    expect(ctx.status().kind).toBe('projecting');
  });

  it('clears a stopped notice when the operator reopens', () => {
    ctx.manager.openOnDisplay(2);
    ctx.windows[0]!.crash();
    expect(ctx.noticeIds()).toContain(PRESENTATION_STOPPED_NOTICE_ID);
    ctx.manager.openPreview();
    expect(ctx.noticeIds()).not.toContain(PRESENTATION_STOPPED_NOTICE_ID);
  });

  it('refuses the display that hosts the Controller and missing displays', () => {
    expect(ctx.manager.openOnDisplay(1).ok).toBe(false);
    expect(ctx.manager.openOnDisplay(99).ok).toBe(false);
    expect(ctx.windows).toHaveLength(0);
  });

  it('Stop closes the window and leaves no notice', () => {
    ctx.manager.openOnDisplay(2);
    ctx.windows[0]!.ready();
    ctx.manager.close();
    expect(ctx.status()).toEqual({ kind: 'closed' });
    expect(ctx.store.getSnapshot().notices).toEqual([]);
    expect(ctx.registry.getPresentation()).toBeNull();
  });
});
