import { describe, expect, it } from 'vitest';
import css from './PatternsView.module.css?raw';

/** The text of one rule, e.g. ".view { ... }", so a test can check what that rule says. */
function rule(text: string, selector: string): string {
  const start = text.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`No rule for ${selector}`);
  return text.slice(start, text.indexOf('}', start));
}

/**
 * The pattern editor is three equal columns (thirds): saved patterns, the editor, and the title and save actions.
 * jsdom has no layout, so this checks that the CSS keeps saying so; the real widths and the 44 px touch floor were
 * measured in a browser.
 */
describe('the pattern editor layout is in thirds', () => {
  it('has three equal columns', () => {
    expect(rule(css, '.view')).toMatch(/grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  });

  it('sizes the cells from their own column, so the grid always fits its third', () => {
    expect(rule(css, '.editor')).toMatch(/container-type:\s*inline-size/);
    expect(rule(css, '.cells')).toMatch(/--cell:\s*min\(var\(--cell-size\),\s*calc\(\(100cqw/);
    expect(rule(css, '.cells')).toMatch(/grid-template-columns:\s*repeat\(5,\s*var\(--cell\)\)/);
  });
});
