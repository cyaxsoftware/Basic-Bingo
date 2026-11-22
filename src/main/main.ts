/**
 * Main-process entry point and composition root.
 *
 * Startup:  single-instance lock -> load state -> create store -> Controller
 *           window -> IPC -> display watching. The Presentation window is
 *           never opened automatically (operator action only).
 * Shutdown: closing the Controller quits the app, but only after the close
 *           guard confirms the game is saved or the operator chooses to quit
 *           anyway. before-quit then waits (bounded) for any last save.
 *
 * See docs/architecture.md for the full picture.
 */
import { app, BrowserWindow, dialog, ipcMain, Menu, screen, session } from 'electron';
import started from 'electron-squirrel-startup';
import type { Notice } from '../shared/ipc/contract';
import { confirmClose, describeUnsavedGame, type CloseChoice } from './app/closeGuard';
import { registerIpcHandlers } from './ipc/registerIpcHandlers';
import { resolveDataDirectory } from './persistence/dataDirectory';
import { JsonStateRepository, type LoadResult } from './persistence/stateRepository';
import { installOfflinePolicy } from './security/offlinePolicy';
import { AppStore } from './state/appStore';
import { createAppWindow } from './windows/createAppWindow';
import { createControllerWindow } from './windows/controllerWindow';
import { DisplayManager } from './windows/displayManager';
import { PresentationWindowManager } from './windows/presentationWindowManager';
import { devServerOrigins } from './windows/rendererEntry';
import { WindowRegistry } from './windows/windowRegistry';

const APP_USER_MODEL_ID = 'com.cyaxsoftware.offlinebingodisplay';
/** How long closing the Controller waits for a pending save before asking the operator. */
const CLOSE_SAVE_DEADLINE_MS = 2000;
/** Upper bound on how long any quit path may wait for the last save. */
const SHUTDOWN_SAVE_DEADLINE_MS = 3000;
/** Order matches the dialog buttons in installCloseGuard. */
const CLOSE_CHOICES: readonly CloseChoice[] = ['retry', 'keepOpen', 'quit'];

function main(): void {
  // Squirrel installer events (install/uninstall shortcuts) launch the app briefly.
  if (started) {
    app.quit();
    return;
  }

  // Automated tests run against a throwaway data folder. Ignored in packaged builds
  // so it can never redirect a real installation's saved game.
  const testUserData = process.env['BINGO_USER_DATA_DIR'];
  if (testUserData && !app.isPackaged) app.setPath('userData', testUserData);

  // A second copy would fight over the state file and the projector.
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }

  app.setAppUserModelId(APP_USER_MODEL_ID);
  const registry = new WindowRegistry();

  app.on('second-instance', () => {
    const controller = registry.getController();
    if (!controller) return;
    if (controller.isMinimized()) controller.restore();
    controller.show();
    controller.focus();
  });

  app
    .whenReady()
    .then(() => startApplication(registry))
    .catch((error: unknown) => fatal('Startup failed', error));
}

async function startApplication(registry: WindowRegistry): Promise<void> {
  if (app.isPackaged) Menu.setApplicationMenu(null);
  installOfflinePolicy(session.defaultSession, app.isPackaged ? [] : devServerOrigins());

  const repository = new JsonStateRepository(resolveDataDirectory(app.getPath('userData')));
  const loaded = await repository.load();
  const store = new AppStore({
    initialState: loaded.state,
    persister: repository,
    initialNotices: recoveryNotices(loaded),
  });
  if (loaded.issues.length > 0) console.warn('[startup] state load issues:', loaded.issues);

  const controller = createControllerWindow();
  registry.setController(controller);

  const displays = new DisplayManager(screen, () => {
    const window = registry.getController();
    return window ? window.getBounds() : null;
  });
  const presentation = new PresentationWindowManager({
    store,
    displays,
    registry,
    createWindow: (options) => createAppWindow('presentation', options),
  });

  registerIpcHandlers(ipcMain, { store, presentation, displays, senders: registry });
  store.subscribe((snapshot) => registry.broadcast(snapshot));

  displays.start((list) => {
    store.setDisplays(list);
    presentation.handleDisplaysChanged(list);
  });
  displays.refresh();
  // The Controller may be dragged to another monitor; keep "hostsController" accurate.
  controller.on('moved', () => displays.scheduleRefresh());

  installCloseGuard(controller, store);
  controller.on('closed', () => {
    registry.setController(null);
    app.quit();
  });

  installShutdown(store, presentation, displays);
}

/**
 * Closing the Controller quits the app, so check the game is saved first,
 * while the window still exists to anchor a dialog. If the latest save failed
 * or is slow, the operator chooses: retry, keep the app open, or quit anyway.
 */
function installCloseGuard(controller: BrowserWindow, store: AppStore): void {
  let closeApproved = false;
  let checking = false;

  controller.on('close', (event) => {
    if (closeApproved) return;
    event.preventDefault();
    if (checking) return;
    checking = true;

    confirmClose({
      deadlineMs: CLOSE_SAVE_DEADLINE_MS,
      settleSaves: (ms) => store.settleSaves(ms),
      retrySave: () => store.retrySave(),
      ask: async (outcome) => {
        const { message, detail } = describeUnsavedGame(outcome);
        const { response } = await dialog.showMessageBox(controller, {
          type: 'warning',
          title: 'Game not saved',
          message,
          detail,
          buttons: ['Retry save', 'Keep app open', 'Quit anyway'],
          defaultId: 0,
          cancelId: 1,
          noLink: true,
        });
        return CLOSE_CHOICES[response] ?? 'keepOpen';
      },
    })
      .then((mayClose) => {
        if (!mayClose || controller.isDestroyed()) return;
        closeApproved = true;
        controller.close();
      })
      // If the guard itself breaks, stay open: the operator can try again, and no calls are lost.
      .catch((error: unknown) => console.error('[close-guard] failed', error))
      .finally(() => {
        checking = false;
      });
  });
}

/** Last-chance wait for saves on any quit path, bounded so the app always exits. */
function installShutdown(store: AppStore, presentation: PresentationWindowManager, displays: DisplayManager) {
  let readyToQuit = false;
  let shuttingDown = false;

  app.on('before-quit', (event) => {
    if (readyToQuit) return;
    event.preventDefault();
    if (shuttingDown) return;
    shuttingDown = true;

    displays.stop();
    presentation.close();
    store
      .settleSaves(SHUTDOWN_SAVE_DEADLINE_MS)
      .then((outcome) => {
        if (outcome !== 'saved') console.error(`[shutdown] quitting with latest save ${outcome}`);
      })
      .catch((error: unknown) => console.error('[shutdown] save check failed', error))
      .finally(() => {
        readyToQuit = true;
        app.quit();
      });
  });

  app.on('window-all-closed', () => app.quit());
}

function recoveryNotices(loaded: LoadResult): Notice[] {
  if (loaded.source === 'backup') {
    return [
      {
        id: 'state-recovered-from-backup',
        level: 'warning',
        message:
          'The saved game could not be read, so the previous backup was restored. Check the called numbers.',
      },
    ];
  }
  if (loaded.source === 'defaults' && loaded.issues.length > 0) {
    return [
      {
        id: 'state-reset-unreadable',
        level: 'error',
        message:
          'The saved game could not be read and no backup was usable, so a new game was started. The unreadable file was kept for inspection.',
      },
    ];
  }
  if (loaded.issues.length > 0) {
    return [
      { id: 'state-normalized', level: 'info', message: `Saved game repaired: ${loaded.issues.join(' ')}` },
    ];
  }
  return [];
}

function fatal(message: string, error: unknown): void {
  console.error(`[fatal] ${message}`, error);
  for (const window of BrowserWindow.getAllWindows()) window.destroy();
  app.exit(1);
}

main();
