import { expect, it } from 'vitest';
import layoutCss from './ControllerApp.module.css?raw';

it('gives notices and the pattern strip their own space before the scrollable ball grid', () => {
  // A short window with several notices used to draw the strip on top of focused controls.
  expect(layoutCss).toMatch(/\.layout\s*\{[^}]*overflow-y:\s*auto/);
  expect(layoutCss).toMatch(/repeat\(4, max-content\) minmax\(var\(--board-min\), 1fr\)/);
  expect(layoutCss).toMatch(/--strip-track:\s*max-content/);
  expect(layoutCss).toMatch(
    /var\(--strip-track\) minmax\(\s*var\(--board-min\),\s*var\(--board-track\)\s*\)/,
  );
});

it('keeps the BINGO status and call summary from sizing the pattern strip track', () => {
  expect(layoutCss).toMatch(/\.side\s*\{[^}]*contain:\s*size/);
});
