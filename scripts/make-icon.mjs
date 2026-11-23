/**
 * Regenerates build/icon.ico, build/icon.png and the build/icon-*.svg sources.
 * Run from the repo root: node scripts/make-icon.mjs
 * Needs a Chromium that Playwright can launch (set CHROMIUM_PATH to use a specific one).
 * 16/24/32 px use a simplified drawing (one big letter, or none at 16) so they stay legible.
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const defs = `<defs>
<radialGradient id="shine" cx="34%" cy="26%" r="70%"><stop offset="0" stop-color="#fff" stop-opacity=".6"/><stop offset=".4" stop-color="#fff" stop-opacity="0"/></radialGradient>
<radialGradient id="shade" cx="50%" cy="50%" r="52%"><stop offset=".72" stop-color="#450a0a" stop-opacity="0"/><stop offset="1" stop-color="#450a0a" stop-opacity=".4"/></radialGradient>
<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1e40af"/><stop offset="1" stop-color="#0f172a"/></linearGradient></defs>`;
const ball = (disc, r = 100) => `<rect x="4" y="4" width="248" height="248" rx="56" fill="url(#bg)"/>
<circle cx="128" cy="128" r="${r}" fill="#ef4444"/><circle cx="128" cy="128" r="${r}" fill="url(#shade)"/>
<circle cx="128" cy="128" r="${disc}" fill="#fff"/>`;
const full = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">${defs}${ball(64)}
<g transform="translate(92 106) scale(.73)" fill="none" stroke="#111827" stroke-width="15" stroke-linejoin="round" stroke-linecap="round">
<path d="M0 0V60M0 0H20Q34 0 34 14Q34 28 20 28H0M0 28H24Q40 28 40 44Q40 60 24 60H0"/><path d="M61 0H99L72 60"/></g>
<circle cx="128" cy="128" r="100" fill="url(#shine)"/></svg>`;
// Small sizes: one big letter, thicker strokes, no fine detail.
const small = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">${defs}${ball(78, 110)}
<g transform="translate(100 82) scale(1.3)" fill="none" stroke="#111827" stroke-width="16" stroke-linejoin="round" stroke-linecap="round">
<path d="M0 0V54M0 0H12Q26 0 26 13Q26 26 12 26H0M0 26H15Q31 26 31 40Q31 54 15 54H0"/></g>
<circle cx="128" cy="128" r="110" fill="url(#shine)"/></svg>`;
fs.mkdirSync('build', { recursive: true });
fs.writeFileSync('build/icon-full.svg', full);
fs.writeFileSync('build/icon-small.svg', small);
const b = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
const tiny = small.replace(/<g transform="translate\(100[\s\S]*?<\/g>/, '');
const sizes = [16, 24, 32, 48, 64, 128, 256];
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'icon-'));
for (const s of sizes) {
  const p = await b.newPage({ viewport: { width: s, height: s } });
  await p.setContent(
    `<body style="margin:0;background:transparent">${s <= 16 ? tiny : s <= 32 ? small : full}`.replace(
      /<svg /,
      `<svg width="${s}" height="${s}" `,
    ),
  );
  await p.screenshot({ path: `${tmp}/${s}.png`, omitBackground: true });
  await p.close();
}
await b.close();
// Build .ico with PNG-compressed entries.
const bufs = sizes.map((s) => fs.readFileSync(`${tmp}/${s}.png`));
const head = Buffer.alloc(6);
head.writeUInt16LE(1, 2);
head.writeUInt16LE(sizes.length, 4);
let off = 6 + 16 * sizes.length;
const dir = [];
sizes.forEach((s, i) => {
  const e = Buffer.alloc(16);
  e[0] = s === 256 ? 0 : s;
  e[1] = s === 256 ? 0 : s;
  e.writeUInt16LE(1, 4);
  e.writeUInt16LE(32, 6);
  e.writeUInt32LE(bufs[i].length, 8);
  e.writeUInt32LE(off, 12);
  off += bufs[i].length;
  dir.push(e);
});
fs.copyFileSync(`${tmp}/256.png`, 'build/icon.png');
fs.writeFileSync('build/icon.ico', Buffer.concat([head, ...dir, ...bufs]));
