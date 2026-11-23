import { describe, expect, it } from 'vitest';
import panelCss from '../../controller/components/SingleImagePanel.module.css?raw';
import viewCss from './SingleImageView.module.css?raw';

/** The text of one rule, e.g. ".image { ... }", so a test can check what that rule says. */
function rule(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`No rule for ${selector}`);
  return css.slice(start, css.indexOf('}', start));
}

/**
 * Fit versus Fill only differs when the image's box is the SHAPE OF THE SCREEN. A box with `height: 100%` inside
 * a grid did not resolve to the screen's height: it took the picture's own shape, so Fit and Fill looked identical
 * (and a tall picture overflowed). Pinning the image to its container's edges gives it a screen-shaped box.
 * jsdom has no layout, so this checks that the CSS keeps doing that.
 */
describe('the image is pinned to its container, so Fit and Fill differ', () => {
  it.each([
    ['the projector image', viewCss, '.image'],
    ['the Controller preview image', panelCss, '.previewImage'],
    ['a library thumbnail', panelCss, '.thumbImage'],
  ])('%s', (_name, css, selector) => {
    const text = rule(css, selector);
    expect(text).toMatch(/position:\s*absolute/);
    expect(text).toMatch(/inset:\s*0/);
    expect(text).toMatch(/object-fit:\s*contain/);
  });

  it('Fill switches the projector image and the preview to cover', () => {
    expect(rule(viewCss, ".stage[data-fit='fill'] .image")).toMatch(/object-fit:\s*cover/);
    expect(rule(panelCss, ".preview[data-fit='fill'] .previewImage")).toMatch(/object-fit:\s*cover/);
  });

  it('the containers the images are pinned to are positioned', () => {
    expect(rule(viewCss, '.stage')).toMatch(/position:\s*relative/);
    expect(rule(panelCss, '.preview')).toMatch(/position:\s*relative/);
    expect(rule(panelCss, '.thumb')).toMatch(/position:\s*relative/);
  });
});
