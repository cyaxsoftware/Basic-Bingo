import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * One config shared by both renderer windows. Forge calls it once per entry in
 * forge.config.mts `renderer[]`; `forgeConfigSelf.name` tells us which one.
 *
 * Each window is its own Vite root (with its own index.html) so the two views
 * can be built, styled and reasoned about independently.
 */
const RENDERER_ROOTS: Record<string, string> = {
  controller_window: 'src/renderer/controller',
  presentation_window: 'src/renderer/presentation',
};

/**
 * Production Content-Security-Policy. Injected only in builds because the Vite
 * dev server needs inline scripts and websockets for hot reload.
 * The app must run fully offline, so nothing remote is ever allowed.
 */
const PRODUCTION_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: bingo-media:",
  "font-src 'self'",
  "connect-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

function productionCsp(): Plugin {
  return {
    name: 'bingo:production-csp',
    apply: 'build',
    transformIndexHtml: () => [
      {
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: PRODUCTION_CSP },
        injectTo: 'head-prepend',
      },
    ],
  };
}

export default defineConfig((env) => {
  const self = env.forgeConfigSelf;
  const name = self && 'name' in self ? (self.name ?? '') : '';
  const relativeRoot = RENDERER_ROOTS[name];
  if (!relativeRoot) {
    throw new Error(`Unknown renderer "${name}". Add it to RENDERER_ROOTS in vite.renderer.config.mts.`);
  }
  const projectRoot = env.root;
  return {
    root: path.resolve(projectRoot, relativeRoot),
    // Forge resolves outDir relative to root; keep it at the location the main
    // process expects (.vite/renderer/<name>).
    build: { outDir: path.resolve(projectRoot, '.vite/renderer', name), emptyOutDir: true },
    plugins: [react(), productionCsp()],
  };
});
