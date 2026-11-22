/// <reference types="@electron-forge/plugin-vite/forge-vite-env" />

// Globals injected into the main-process bundle by Forge's Vite plugin, one
// pair per renderer declared in forge.config.mts. In development the URL points
// at the Vite dev server; in a packaged build it is undefined and the NAME is
// used to locate the built index.html.
declare const CONTROLLER_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const CONTROLLER_WINDOW_VITE_NAME: string;
declare const PRESENTATION_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const PRESENTATION_WINDOW_VITE_NAME: string;
