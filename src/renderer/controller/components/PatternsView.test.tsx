import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createSnapshotStore } from '../../shared/snapshotStore';
import { createFakeBingoApi, makeSnapshot } from '../../test/fakeBingoApi';
import { ControllerApp } from '../ControllerApp';

// The real shared reducer sits behind the fake bridge, so these tests cover the whole path from a tap to
// the working copy, the "Edited" flag and the library.
async function renderController() {
  const api = createFakeBingoApi(makeSnapshot());
  render(<ControllerApp api={api} store={createSnapshotStore(api)} />);
  await screen.findByRole('button', { name: /^Pattern/ });
  return api;
}

async function openPatterns() {
  const api = await renderController();
  await userEvent.click(screen.getByRole('button', { name: /^Pattern/ }));
  return { api, view: screen.getByRole('region', { name: 'Patterns' }) };
}

const cell = (view: HTMLElement, row: number, column: number) =>
  within(view).getByRole('button', { name: `Row ${row}, column ${column}` });

const item = (view: HTMLElement, title: string) => within(view).getByRole('button', { name: title });

describe('Patterns view', () => {
  it('opens from the Pattern card and goes back to the game with the calls intact', async () => {
    const api = await renderController();
    await userEvent.click(screen.getByRole('button', { name: /^B-3,/ }));
    expect(screen.getByRole('button', { name: /^Pattern/ })).toHaveTextContent('Untitled pattern');

    await userEvent.click(screen.getByRole('button', { name: /^Pattern/ }));
    expect(screen.getByRole('region', { name: 'Patterns' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'B row' })).toBeNull();
    // What the operator may need at any moment is still there.
    expect(screen.getByRole('button', { name: 'BINGO CALLED' })).toBeInTheDocument();
    expect(screen.getByTestId('called-count')).toHaveTextContent('Called: 1 of 75');
    expect(screen.queryByRole('tab')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: /Back to game/ }));
    expect(screen.queryByRole('region', { name: 'Patterns' })).toBeNull();
    expect(screen.getByRole('button', { name: /^B-3,/ })).toHaveAttribute('aria-pressed', 'true');
    expect(api.current().game.calledNumbers).toEqual([3]);
  });

  it('lists the saved patterns and marks the one this game was copied from', async () => {
    const { view } = await openPatterns();
    for (const title of ['Four Corners', 'Big L', 'Letter X', 'Blackout']) {
      expect(item(view, title)).not.toHaveAttribute('aria-current');
    }
    await userEvent.click(item(view, 'Big L'));
    expect(item(view, 'Big L')).toHaveAttribute('aria-current', 'true');
    expect(item(view, 'Blackout')).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('button', { name: /^Pattern/ })).toHaveTextContent('Big L');
  });

  it('toggles a cell on and off, and shows no Edited flag for a one-off', async () => {
    const { api, view } = await openPatterns();
    expect(view).toHaveTextContent(/not in the saved library/);
    await userEvent.click(cell(view, 3, 3));
    expect(api.current().activePattern.cells[12]).toBe(true);
    expect(cell(view, 3, 3)).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(cell(view, 3, 3));
    expect(api.current().activePattern.cells[12]).toBe(false);
    expect(within(view).queryByText('Edited')).toBeNull();
  });

  it('renames the working pattern when the title is committed, and ignores an empty one', async () => {
    const { api, view } = await openPatterns();
    const title = within(view).getByRole('textbox', { name: /Title/ });
    await userEvent.clear(title);
    await userEvent.type(title, 'Four corners{Enter}');
    expect(api.current().activePattern.title).toBe('Four corners');

    await userEvent.clear(title);
    await userEvent.tab();
    expect(api.current().activePattern.title).toBe('Four corners');
    expect(title).toHaveValue('Four corners');
  });

  it('shows Edited while the copy differs from its template, and clears it when the edit is undone', async () => {
    const { api, view } = await openPatterns();
    await userEvent.click(item(view, 'Big L'));
    expect(api.current().activePattern.sourcePatternId).toBe('seed-big-l');
    expect(within(view).queryByText('Edited')).toBeNull();

    await userEvent.click(cell(view, 3, 3));
    expect(within(view).getByText('Edited')).toBeInTheDocument();
    // Also on the game screen's card.
    await userEvent.click(screen.getByRole('button', { name: /Back to game/ }));
    expect(screen.getByRole('button', { name: /^Pattern/ })).toHaveTextContent('Edited');

    await userEvent.click(screen.getByRole('button', { name: /^Pattern/ }));
    const reopened = screen.getByRole('region', { name: 'Patterns' });
    await userEvent.click(cell(reopened, 3, 3));
    expect(within(reopened).queryByText('Edited')).toBeNull();
  });

  it('Update Saved Pattern writes the edit to the library; it is off until there is one', async () => {
    const { api, view } = await openPatterns();
    await userEvent.click(item(view, 'Big L'));
    const update = within(view).getByRole('button', { name: 'Update Saved Pattern' });
    expect(update).toBeDisabled();

    await userEvent.click(cell(view, 3, 3));
    expect(update).toBeEnabled();
    await userEvent.click(update);
    const saved = api.current().patternLibrary.find((pattern) => pattern.id === 'seed-big-l');
    expect(saved?.cells[12]).toBe(true);
    expect(api.current().activePattern.editedFromLibrary).toBe(false);
  });

  it('Save As New Pattern adds a library entry and leaves the original alone', async () => {
    const { api, view } = await openPatterns();
    await userEvent.click(item(view, 'Big L'));
    const before = api.current().patternLibrary;
    await userEvent.click(cell(view, 3, 3));
    await userEvent.click(within(view).getByRole('button', { name: 'Save As New Pattern' }));
    expect(api.current().patternLibrary).toHaveLength(before.length + 1);
    expect(api.current().patternLibrary.find((pattern) => pattern.id === 'seed-big-l')?.cells[12]).toBe(
      false,
    );
  });

  it('switches straight away when nothing is unsaved', async () => {
    const { api, view } = await openPatterns();
    await userEvent.click(item(view, 'Big L'));
    await userEvent.click(item(view, 'Blackout'));
    expect(api.current().activePattern.sourcePatternId).toBe('seed-blackout');
    expect(within(view).queryByText(/not saved/)).toBeNull();
  });

  describe('switching with unsaved edits', () => {
    async function editThenAskToSwitch() {
      const open = await openPatterns();
      await userEvent.click(item(open.view, 'Big L'));
      await userEvent.click(cell(open.view, 3, 3));
      await userEvent.click(item(open.view, 'Blackout'));
      return open;
    }

    it('asks first and changes nothing until answered; Keep editing cancels', async () => {
      const { api, view } = await editThenAskToSwitch();
      expect(view).toHaveTextContent(/Your edits to Big L are not saved/);
      expect(api.current().activePattern.sourcePatternId).toBe('seed-big-l');

      await userEvent.click(within(view).getByRole('button', { name: 'Keep editing' }));
      expect(api.current().activePattern).toMatchObject({
        sourcePatternId: 'seed-big-l',
        editedFromLibrary: true,
      });
      expect(within(view).queryByText(/not saved/)).toBeNull();
    });

    it('Escape cancels the question and stays on the Patterns screen', async () => {
      const { api, view } = await editThenAskToSwitch();
      await userEvent.keyboard('{Escape}');
      expect(screen.getByRole('region', { name: 'Patterns' })).toBe(view);
      expect(within(view).queryByText(/not saved/)).toBeNull();
      expect(api.current().activePattern.sourcePatternId).toBe('seed-big-l');
    });

    it('Discard drops the edits and switches, leaving the library untouched', async () => {
      const { api, view } = await editThenAskToSwitch();
      await userEvent.click(within(view).getByRole('button', { name: 'Discard edits and switch' }));
      expect(api.current().activePattern.sourcePatternId).toBe('seed-blackout');
      expect(api.current().patternLibrary.find((pattern) => pattern.id === 'seed-big-l')?.cells[12]).toBe(
        false,
      );
    });

    it('Update saved, then switch writes the edit to the template first', async () => {
      const { api, view } = await editThenAskToSwitch();
      await userEvent.click(within(view).getByRole('button', { name: 'Update saved, then switch' }));
      expect(api.current().activePattern.sourcePatternId).toBe('seed-blackout');
      expect(api.current().patternLibrary.find((pattern) => pattern.id === 'seed-big-l')?.cells[12]).toBe(
        true,
      );
    });

    it('Save as new, then switch keeps the edit as a new pattern and the original unchanged', async () => {
      const { api, view } = await editThenAskToSwitch();
      const before = api.current().patternLibrary.length;
      await userEvent.click(within(view).getByRole('button', { name: 'Save as new, then switch' }));
      expect(api.current().activePattern.sourcePatternId).toBe('seed-blackout');
      expect(api.current().patternLibrary).toHaveLength(before + 1);
      expect(api.current().patternLibrary.find((pattern) => pattern.id === 'seed-big-l')?.cells[12]).toBe(
        false,
      );
    });
  });
});
