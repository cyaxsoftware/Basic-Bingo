// Preload for the Presentation window: read-only. No command functions are exposed,
// and main additionally rejects commands from this window's webContents.
import { contextBridge } from 'electron';
import { BRIDGE_KEY, createPresentationApi } from './exposeBridge';

contextBridge.exposeInMainWorld(BRIDGE_KEY, createPresentationApi());
