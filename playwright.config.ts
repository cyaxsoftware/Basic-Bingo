import { defineConfig } from '@playwright/test';

/**
 * End-to-end tests drive the real Electron app (main process, both windows,
 * IPC and persistence). Run with `npm run test:e2e`, which builds first.
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    trace: 'retain-on-failure',
  },
});
