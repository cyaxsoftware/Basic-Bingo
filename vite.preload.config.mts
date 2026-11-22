import { defineConfig } from 'vite';

// Preload scripts run in a sandboxed renderer: they may import from src/shared
// (bundled in) and from 'electron', but never Node built-ins.
// https://vitejs.dev/config
export default defineConfig({});
