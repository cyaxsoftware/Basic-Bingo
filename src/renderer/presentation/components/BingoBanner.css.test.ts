import { describe, expect, it } from 'vitest';
import appCss from '../PresentationApp.module.css?raw';
import bannerCss from './BingoBanner.module.css?raw';

/** The text of one rule, e.g. ".banner { ... }", so a test can check what that rule says. */
function rule(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`No rule for ${selector}`);
  return css.slice(start, css.indexOf('}', start));
}

/**
 * The BINGO CALLED banner must not make the rest of the screen move. The Game Board always keeps a band of a
 * fixed height at the top; the banner fills that band exactly, whatever its text does. jsdom has no layout, so
 * this checks that the CSS keeps doing that (the real positions were measured in a browser).
 */
describe('the banner band is reserved, so raising the banner moves nothing', () => {
  it('the band has a fixed height of its own and does not shrink', () => {
    const slot = rule(appCss, '.bannerSlot');
    expect(slot).toMatch(/height:\s*[\d.]+vmin/);
    expect(slot).toMatch(/flex:\s*none/);
  });

  it('the banner fills the band instead of sizing itself from its text', () => {
    const banner = rule(bannerCss, '.banner');
    expect(banner).toMatch(/height:\s*100%/);
    expect(banner).toMatch(/box-sizing:\s*border-box/);
    // Nothing that would make it taller than the band: no vertical padding or margin of its own.
    expect(banner).toMatch(/padding:\s*0 /);
    expect(banner).not.toMatch(/margin/);
  });

  it('the text is capped by the width as well as the height, so it stays on one line on any screen shape', () => {
    expect(rule(bannerCss, '.banner')).toMatch(/font-size:\s*min\([\d.]+vmin,\s*[\d.]+vw\)/);
  });
});
