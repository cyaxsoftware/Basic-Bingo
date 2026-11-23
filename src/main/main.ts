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
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { app, BrowserWindow, dialog, ipcMain, Menu, protocol, screen, session, shell } from 'electron';
import started from 'electron-squirrel-startup';
import { WINDOWS_APP_USER_MODEL_ID } from '../shared/appInfo';
import { fail, ok, type CommandResult } from '../shared/ipc/contract';
import { MEDIA_PROTOCOL } from '../shared/media';
import { confirmClose, describeUnsavedGame, type CloseChoice } from './app/closeGuard';
import { registerIpcHandlers } from './ipc/registerIpcHandlers';
import { answerMediaRequest, ImageLibraryService } from './media/mediaService';
import { PowerPointImportService } from './media/powerPointImport';
import {
  isTestDataRedirect,
  legacyCopyFailedNotice,
  legacyDataDirectory,
  migrateLegacyDataDirectory,
  resolveDataDirectory,
} from './persistence/dataDirectory';
import { fromPersistedState } from './persistence/persistedState';
import { recoveryNotices } from './persistence/recoveryNotices';
import { JsonStateRepository } from './persistence/stateRepository';
import { installOfflinePolicy } from './security/offlinePolicy';
import { AppStore } from './state/appStore';
import { startSlideshowService, startTimerService } from './timer/timerService';
import { createAppWindow } from './windows/createAppWindow';
import { createControllerWindow } from './windows/controllerWindow';
import { DisplayManager } from './windows/displayManager';
import { PresentationWindowManager } from './windows/presentationWindowManager';
import { devServerOrigins } from './windows/rendererEntry';
import { WindowRegistry } from './windows/windowRegistry';

// The windows show library images through bingo-media://<id>. A custom scheme has to be declared before the app is
// ready; "standard" gives it normal URL handling (the id is the host) and "secure" lets pages use it like https.
protocol.registerSchemesAsPrivileged([
  { scheme: MEDIA_PROTOCOL, privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);
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
  if (testUserData && isTestDataRedirect(process.env, app.isPackaged)) app.setPath('userData', testUserData);

  // A second copy would fight over the state file and the projector.
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }

  if (process.platform === 'win32') app.setAppUserModelId(WINDOWS_APP_USER_MODEL_ID);
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

  // Not when tests redirect userData: appData is the real one and must not leak into a throwaway folder. (Tied to
  // the same check as the redirect itself, so a packaged app with the variable set still gets its data copied.)
  let migrationFailure: unknown;
  if (!isTestDataRedirect(process.env, app.isPackaged)) {
    await migrateLegacyDataDirectory(app.getPath('appData'), app.getPath('userData')).catch(
      (error: unknown) => {
        migrationFailure = error ?? new Error('unknown error');
        console.warn('[startup] could not carry over data from the old app folder:', error);
      },
    );
  }
  const dataDirectory = resolveDataDirectory(app.getPath('userData'));
  const repository = new JsonStateRepository(dataDirectory);
  const loaded = await repository.load();
  const store = new AppStore({
    initialData: fromPersistedState(loaded.state),
    persister: repository,
    initialNotices: [
      ...recoveryNotices(loaded),
      // If the old data could not be copied, say so (and where it is) instead of quietly starting from nothing.
      ...(migrationFailure === undefined
        ? []
        : [
            legacyCopyFailedNotice(
              migrationFailure,
              legacyDataDirectory(app.getPath('appData')),
              dataDirectory,
            ),
          ]),
    ],
  });
  if (loaded.issues.length > 0) console.warn('[startup] state load issues:', loaded.issues);

  // Imported images live in bingo-data/media. Only this service reads or writes them.
  const media = new ImageLibraryService({
    store,
    directory: path.join(dataDirectory, 'media'),
    pickFiles: () => pickImageFiles(registry.getController()),
  });
  const powerPoint = new PowerPointImportService({
    media,
    pickDeck: () => pickPowerPointFile(registry.getController()),
  });
  protocol.handle(MEDIA_PROTOCOL, async (request) => {
    const answer = await answerMediaRequest(media, request.url);
    if (answer.status !== 200 || !answer.data) return new Response(null, { status: answer.status });
    return new Response(new Uint8Array(answer.data), {
      status: 200,
      headers: { 'Content-Type': answer.mimeType ?? 'application/octet-stream', 'Cache-Control': 'no-store' },
    });
  });
  // Tell the operator now (not with a broken picture later) if an image's file has gone missing.
  void media.checkFiles();

  const controller = createControllerWindow(store.getSnapshot().controllerTheme);
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

  // "Show data folder", for support: opens it in Explorer (created first, in case it has gone missing).
  const dataFolder = {
    show: async (): Promise<CommandResult> => {
      await mkdir(dataDirectory, { recursive: true }).catch(() => undefined);
      const problem = await shell.openPath(dataDirectory);
      if (problem === '') return ok;
      console.error('[support] could not open the data folder:', problem);
      return fail('Windows could not open the data folder.');
    },
  };

  registerIpcHandlers(ipcMain, {
    store,
    media,
    powerPoint,
    presentation,
    displays,
    dataFolder,
    senders: registry,
  });
  store.subscribe((snapshot) => registry.broadcast(snapshot));
  const stopTimerService = startTimerService(store);
  const stopSlideshowService = startSlideshowService(store);

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

  installShutdown(store, presentation, displays, () => {
    stopTimerService();
    stopSlideshowService();
  });
}

/** The native "Add images" dialog, over the Controller. An empty list means the operator cancelled. */
async function pickImageFiles(parent: BrowserWindow | null): Promise<string[]> {
  const options: Electron.OpenDialogOptions = {
    title: 'Add images',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
  };
  const result = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options);
  return result.canceled ? [] : result.filePaths;
}

async function pickPowerPointFile(parent: BrowserWindow | null): Promise<string | null> {
  const options: Electron.OpenDialogOptions = {
    title: 'Import PowerPoint',
    properties: ['openFile'],
    filters: [{ name: 'PowerPoint presentation', extensions: ['pptx'] }],
  };
  const result = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options);
  return result.canceled ? null : (result.filePaths[0] ?? null);
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
function installShutdown(
  store: AppStore,
  presentation: PresentationWindowManager,
  displays: DisplayManager,
  stopDeadlines: () => void,
) {
  let readyToQuit = false;
  let shuttingDown = false;

  app.on('before-quit', (event) => {
    if (readyToQuit) return;
    event.preventDefault();
    if (shuttingDown) return;
    shuttingDown = true;

    stopDeadlines();
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

function fatal(message: string, error: unknown): void {
  console.error(`[fatal] ${message}`, error);
  for (const window of BrowserWindow.getAllWindows()) window.destroy();
  app.exit(1);
}

main();
