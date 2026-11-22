/**
 * Contrast of text over the design tokens (design doc §4.2: "dark numerals within filled circles for
 * readability, subject to contrast checks"). It reads the real CSS, so changing a colour in a token file
 * is checked automatically.
 */
import { describe, expect, it } from 'vitest';
import { contrastRatio, MIN_TEXT_CONTRAST } from '../../../shared/color/contrast';
import controllerCss from '../../controller/controller.css?raw';
import presentationCss from '../../presentation/presentation.css?raw';
import tokensCss from './tokens.css?raw';

/** Every `--name: #rrggbb;` declaration in a stylesheet. */
function colorTokens(css: string): Record<string, string> {
  const found: Record<string, string> = {};
  for (const [, name, value] of css.matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    if (name && value) found[name] = value;
  }
  return found;
}

const shared = colorTokens(tokensCss);
const controller = { ...shared, ...colorTokens(controllerCss) };
const presentation = { ...shared, ...colorTokens(presentationCss) };

function token(tokens: Record<string, string>, name: string): string {
  const value = tokens[name];
  if (!value) throw new Error(`Design token ${name} not found as a #rrggbb colour.`);
  return value;
}

describe('design token contrast', () => {
  it.each(['b', 'i', 'n', 'g', 'o'])('numerals on the %s ball colour are at least 4.5:1', (letter) => {
    const ratio = contrastRatio(token(shared, '--ball-ink'), token(shared, `--ball-${letter}`));
    expect(ratio).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
  });

  it.each([
    ['the Controller', controller, '--uncalled-text', '--uncalled-bg'],
    ['the projector', presentation, '--uncalled-text', '--uncalled-fill'],
    ['the projector panel labels', presentation, '--stage-muted', '--stage-panel'],
    ['the projector stage text', presentation, '--stage-text', '--stage'],
    ['the BINGO banner', shared, '--bingo-banner-text', '--bingo-banner-bg'],
  ] as const)('uncalled and label text on %s is at least 4.5:1', (_where, tokens, foreground, background) => {
    expect(contrastRatio(token(tokens, foreground), token(tokens, background))).toBeGreaterThanOrEqual(
      MIN_TEXT_CONTRAST,
    );
  });

  it('finds all five ball colours (guards the parser itself)', () => {
    expect(
      Object.keys(shared)
        .filter((name) => /^--ball-[bingo]$/.test(name))
        .toSorted(),
    ).toEqual(['--ball-b', '--ball-g', '--ball-i', '--ball-n', '--ball-o']);
  });
});
