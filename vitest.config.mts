import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * Two test projects:
 *  - node:     domain logic (src/shared) and main-process modules (src/main)
 *  - renderer: React components and hooks, in jsdom
 * Test files live next to the code they test as *.test.ts(x).
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'node',
          environment: 'node',
          include: ['src/shared/**/*.test.ts', 'src/main/**/*.test.ts'],
        },
      },
      {
        plugins: [react()],
        test: {
          name: 'renderer',
          environment: 'jsdom',
          include: ['src/renderer/**/*.test.{ts,tsx}'],
          setupFiles: ['src/renderer/test/setup.ts'],
          // Vitest replaces stylesheets with empty text. Let `?raw` imports through, so the design-token
          // contrast test reads the real token files (src/renderer/shared/styles/tokens.test.ts).
          css: { include: [/\.css\?raw$/] },
        },
      },
    ],
    coverage: {
      include: ['src/shared/**', 'src/main/**', 'src/renderer/**'],
      exclude: ['**/*.test.*', 'src/renderer/test/**'],
    },
  },
});
