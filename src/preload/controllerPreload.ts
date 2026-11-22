// Preload for the Controller window: read state and send game/presentation commands.
import { contextBridge } from 'electron';
import { BRIDGE_KEY, createControllerApi } from './exposeBridge';

contextBridge.exposeInMainWorld(BRIDGE_KEY, createControllerApi());
