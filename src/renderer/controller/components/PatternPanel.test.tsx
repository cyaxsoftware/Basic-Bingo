import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createSnapshotStore } from '../../shared/snapshotStore';
import { createFakeBingoApi, makeSnapshot } from '../../test/fakeBingoApi';
import { ControllerApp } from '../ControllerApp';

// The real shared reducer sits behind the fake bridge, so these tests cover the whole path from a tap to
// the working copy, the "Edited" flag and the library.
async function openPanel() {
  const api = createFakeBingoApi(makeSnapshot());
  render(<ControllerApp api={api} store={createSnapshotStore(api)} />);
  await userEvent.click(await screen.findByRole('button', { name: /^Pattern/ }));
  return { api, sheet: screen.getByRole('region', { name: 'Active pattern' }) };
}

const cell = (sheet: HTMLElement, row: number, column: number) =>
  within(sheet).getByRole('button', { name: `Row ${row}, column ${column}` });

async function chooseBigL(sheet: HTMLElement) {
  await userEvent.selectOptions(within(sheet).getByRole('combobox'), 'seed-big-l');
}

describe('PatternPanel', () => {
  it('stays closed until opened, showing the working pattern title', async () => {
    const api = createFakeBingoApi(makeSnapshot());
    render(<ControllerApp api={api} store={createSnapshotStore(api)} />);
    const toggle = await screen.findByRole('button', { name: /^Pattern/ });
    expect(toggle).toHaveTextContent('Untitled pattern');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('region', { name: 'Active pattern' })).toBeNull();
  });

  it('toggles a cell on and off, and shows no Edited flag for a one-off', async () => {
    const { api, sheet } = await openPanel();
    await userEvent.click(cell(sheet, 3, 3));
    expect(api.current().activePattern.cells[12]).toBe(true);
    expect(cell(sheet, 3, 3)).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(cell(sheet, 3, 3));
    expect(api.current().activePattern.cells[12]).toBe(false);
    expect(within(sheet).queryByText('Edited')).toBeNull();
  });

  it('renames the working pattern when the title is committed, and ignores an empty one', async () => {
    const { api, sheet } = await openPanel();
    const title = within(sheet).getByRole('textbox', { name: /Title/ });
    await userEvent.clear(title);
    await userEvent.type(title, 'Four corners{Enter}');
    expect(api.current().activePattern.title).toBe('Four corners');

    await userEvent.clear(title);
    await userEvent.tab();
    expect(api.current().activePattern.title).toBe('Four corners');
    expect(title).toHaveValue('Four corners');
  });

  it('shows Edited while the copy differs from its template, and clears it when the edit is undone', async () => {
    const { api, sheet } = await openPanel();
    await chooseBigL(sheet);
    expect(api.current().activePattern.sourcePatternId).toBe('seed-big-l');
    expect(within(sheet).queryByText('Edited')).toBeNull();

    await userEvent.click(cell(sheet, 3, 3));
    expect(within(sheet).getByText('Edited')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Pattern/ })).toHaveTextContent('Edited');

    await userEvent.click(cell(sheet, 3, 3));
    expect(within(sheet).queryByText('Edited')).toBeNull();
  });

  it('Update Saved Pattern writes the edit to the library; it is off until there is one', async () => {
    const { api, sheet } = await openPanel();
    await chooseBigL(sheet);
    const update = within(sheet).getByRole('button', { name: 'Update Saved Pattern' });
    expect(update).toBeDisabled();

    await userEvent.click(cell(sheet, 3, 3));
    expect(update).toBeEnabled();
    await userEvent.click(update);
    const saved = api.current().patternLibrary.find((pattern) => pattern.id === 'seed-big-l');
    expect(saved?.cells[12]).toBe(true);
    expect(api.current().activePattern.editedFromLibrary).toBe(false);
  });

  it('Save As New Pattern adds a library entry and leaves the original alone', async () => {
    const { api, sheet } = await openPanel();
    await chooseBigL(sheet);
    const before = api.current().patternLibrary;
    await userEvent.click(cell(sheet, 3, 3));
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save As New Pattern' }));
    expect(api.current().patternLibrary).toHaveLength(before.length + 1);
    expect(api.current().patternLibrary.find((pattern) => pattern.id === 'seed-big-l')?.cells[12]).toBe(
      false,
    );
  });

  it('switches straight away when nothing is unsaved', async () => {
    const { api, sheet } = await openPanel();
    await chooseBigL(sheet);
    await userEvent.selectOptions(within(sheet).getByRole('combobox'), 'seed-blackout');
    expect(api.current().activePattern.sourcePatternId).toBe('seed-blackout');
    expect(within(sheet).queryByText(/not saved/)).toBeNull();
  });

  describe('switching with unsaved edits', () => {
    async function editThenAskToSwitch() {
      const open = await openPanel();
      await chooseBigL(open.sheet);
      await userEvent.click(cell(open.sheet, 3, 3));
      await userEvent.selectOptions(within(open.sheet).getByRole('combobox'), 'seed-blackout');
      return open;
    }

    it('asks first and changes nothing until answered; Keep editing cancels', async () => {
      const { api, sheet } = await editThenAskToSwitch();
      expect(sheet).toHaveTextContent(/Your edits to Big L are not saved/);
      expect(api.current().activePattern.sourcePatternId).toBe('seed-big-l');

      await userEvent.click(within(sheet).getByRole('button', { name: 'Keep editing' }));
      expect(api.current().activePattern).toMatchObject({
        sourcePatternId: 'seed-big-l',
        editedFromLibrary: true,
      });
      expect(within(sheet).getByRole('combobox')).toHaveValue('seed-big-l');
    });

    it('Escape cancels the question without closing the panel', async () => {
      const { api, sheet } = await editThenAskToSwitch();
      await userEvent.keyboard('{Escape}');
      expect(screen.getByRole('region', { name: 'Active pattern' })).toBe(sheet);
      expect(within(sheet).queryByText(/not saved/)).toBeNull();
      expect(api.current().activePattern.sourcePatternId).toBe('seed-big-l');
    });

    it('Discard drops the edits and switches, leaving the library untouched', async () => {
      const { api, sheet } = await editThenAskToSwitch();
      await userEvent.click(within(sheet).getByRole('button', { name: 'Discard edits and switch' }));
      expect(api.current().activePattern.sourcePatternId).toBe('seed-blackout');
      expect(api.current().patternLibrary.find((pattern) => pattern.id === 'seed-big-l')?.cells[12]).toBe(
        false,
      );
    });

    it('Update saved, then switch writes the edit to the template first', async () => {
      const { api, sheet } = await editThenAskToSwitch();
      await userEvent.click(within(sheet).getByRole('button', { name: 'Update saved, then switch' }));
      expect(api.current().activePattern.sourcePatternId).toBe('seed-blackout');
      expect(api.current().patternLibrary.find((pattern) => pattern.id === 'seed-big-l')?.cells[12]).toBe(
        true,
      );
    });

    it('Save as new, then switch keeps the edit as a new pattern and the original unchanged', async () => {
      const { api, sheet } = await editThenAskToSwitch();
      const before = api.current().patternLibrary.length;
      await userEvent.click(within(sheet).getByRole('button', { name: 'Save as new, then switch' }));
      expect(api.current().activePattern.sourcePatternId).toBe('seed-blackout');
      expect(api.current().patternLibrary).toHaveLength(before + 1);
      expect(api.current().patternLibrary.find((pattern) => pattern.id === 'seed-big-l')?.cells[12]).toBe(
        false,
      );
    });
  });

  it('closes with Close or Escape and returns focus to the Pattern button', async () => {
    const { sheet } = await openPanel();
    await userEvent.click(within(sheet).getByRole('button', { name: 'Close' }));
    const toggle = screen.getByRole('button', { name: /^Pattern/ });
    expect(screen.queryByRole('region', { name: 'Active pattern' })).toBeNull();
    expect(toggle).toHaveFocus();

    await userEvent.click(toggle);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('region', { name: 'Active pattern' })).toBeNull();
    expect(toggle).toHaveFocus();
  });
});
