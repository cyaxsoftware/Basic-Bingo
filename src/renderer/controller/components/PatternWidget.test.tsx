import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { createSnapshotStore } from '../../shared/snapshotStore';
import { createFakeBingoApi, makeSnapshot } from '../../test/fakeBingoApi';
import { ControllerApp } from '../ControllerApp';

/** Pretend the window is this size: the Controller picks its pattern UI from min-width / min-height queries. */
function setWindowSize(width: number, height = 900) {
  window.matchMedia = ((query: string) => {
    const minWidth = Number(/min-width:\s*(\d+)px/.exec(query)?.[1] ?? 0);
    const minHeight = Number(/min-height:\s*(\d+)px/.exec(query)?.[1] ?? 0);
    return {
      matches: width >= minWidth && height >= minHeight,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    } as unknown as MediaQueryList;
  }) as typeof window.matchMedia;
}

afterEach(() => {
  // @ts-expect-error jsdom has no matchMedia; remove the stand-in so other tests see none
  delete window.matchMedia;
});

async function renderController(width: number, height = 900) {
  setWindowSize(width, height);
  const api = createFakeBingoApi(makeSnapshot());
  render(<ControllerApp api={api} store={createSnapshotStore(api)} />);
  await screen.findByRole('button', { name: 'BINGO CALLED' });
  return api;
}

const widget = () => screen.getByRole('region', { name: 'Pattern' });
const cell = (row: number, column: number) =>
  within(widget()).getByRole('button', { name: `Row ${row}, column ${column}` });

describe('PatternWidget in the left rail (from 1440 px)', () => {
  it('is on the game screen with the name, the cells, and New Game above it', async () => {
    await renderController(1536);
    expect(within(widget()).getByRole('textbox', { name: /Pattern name/ })).toHaveValue('Untitled pattern');
    expect(within(widget()).getAllByRole('button', { name: /^Row \d, column \d$/ })).toHaveLength(25);
    // One New Game, in the rail, not also in the top bar; the small card is not shown.
    expect(screen.getAllByRole('button', { name: 'New Game' })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /^Pattern/ })).toBeNull();
    expect(screen.getByRole('banner')).not.toContainElement(screen.getByRole('button', { name: 'New Game' }));
  });

  it('edits the name in place: committed on Enter, and an empty name is refused', async () => {
    const api = await renderController(1536);
    const name = within(widget()).getByRole('textbox', { name: /Pattern name/ });
    await userEvent.clear(name);
    await userEvent.type(name, 'Crazy Y{Enter}');
    expect(api.current().activePattern.title).toBe('Crazy Y');

    await userEvent.clear(name);
    await userEvent.tab();
    expect(api.current().activePattern.title).toBe('Crazy Y');
    expect(name).toHaveValue('Crazy Y');
  });

  it('toggles cells, and shows Edited while the copy differs from its saved pattern', async () => {
    const api = await renderController(1536);
    await userEvent.selectOptions(within(widget()).getByRole('combobox'), 'seed-big-l');
    expect(within(widget()).queryByText('Edited')).toBeNull();
    await userEvent.click(cell(3, 3));
    expect(api.current().activePattern.cells[12]).toBe(true);
    expect(within(widget()).getByText('Edited')).toBeInTheDocument();
    await userEvent.click(cell(3, 3));
    expect(within(widget()).queryByText('Edited')).toBeNull();
  });

  it('switches straight away when nothing is unsaved', async () => {
    const api = await renderController(1536);
    await userEvent.selectOptions(within(widget()).getByRole('combobox'), 'seed-big-l');
    await userEvent.selectOptions(within(widget()).getByRole('combobox'), 'seed-blackout');
    expect(api.current().activePattern.sourcePatternId).toBe('seed-blackout');
  });

  describe('switching with unsaved edits', () => {
    async function editThenAskToSwitch() {
      const api = await renderController(1536);
      await userEvent.selectOptions(within(widget()).getByRole('combobox'), 'seed-big-l');
      await userEvent.click(cell(3, 3));
      await userEvent.selectOptions(within(widget()).getByRole('combobox'), 'seed-blackout');
      return api;
    }

    it('asks first; Keep editing and Escape change nothing', async () => {
      const api = await editThenAskToSwitch();
      expect(widget()).toHaveTextContent(/Your edits to Big L are not saved/);
      expect(api.current().activePattern.sourcePatternId).toBe('seed-big-l');
      await userEvent.click(within(widget()).getByRole('button', { name: 'Keep editing' }));
      expect(within(widget()).queryByText(/not saved/)).toBeNull();

      await userEvent.selectOptions(within(widget()).getByRole('combobox'), 'seed-blackout');
      await userEvent.keyboard('{Escape}');
      expect(within(widget()).queryByText(/not saved/)).toBeNull();
      expect(api.current().activePattern.sourcePatternId).toBe('seed-big-l');
    });

    it('Discard switches and leaves the saved pattern untouched', async () => {
      const api = await editThenAskToSwitch();
      await userEvent.click(within(widget()).getByRole('button', { name: 'Discard edits and switch' }));
      expect(api.current().activePattern.sourcePatternId).toBe('seed-blackout');
      expect(api.current().patternLibrary.find((p) => p.id === 'seed-big-l')?.cells[12]).toBe(false);
    });

    it('Update saved, then switch writes the edit to the saved pattern first', async () => {
      const api = await editThenAskToSwitch();
      await userEvent.click(within(widget()).getByRole('button', { name: 'Update saved, then switch' }));
      expect(api.current().activePattern.sourcePatternId).toBe('seed-blackout');
      expect(api.current().patternLibrary.find((p) => p.id === 'seed-big-l')?.cells[12]).toBe(true);
    });

    it('Save as new, then switch keeps the edit as a new saved pattern', async () => {
      const api = await editThenAskToSwitch();
      const before = api.current().patternLibrary.length;
      await userEvent.click(within(widget()).getByRole('button', { name: 'Save as new, then switch' }));
      expect(api.current().activePattern.sourcePatternId).toBe('seed-blackout');
      expect(api.current().patternLibrary).toHaveLength(before + 1);
      expect(api.current().patternLibrary.find((p) => p.id === 'seed-big-l')?.cells[12]).toBe(false);
    });
  });

  describe('Show on projector', () => {
    it('pushes what is in the editor, and the projector keeps it while the editor changes', async () => {
      const api = await renderController(1536);
      await userEvent.selectOptions(within(widget()).getByRole('combobox'), 'seed-big-l');
      expect(api.current().shownPattern).toBeNull();

      await userEvent.click(within(widget()).getByRole('button', { name: 'Show on projector' }));
      expect(api.current().shownPattern?.title).toBe('Big L');
      const pushedCells = [...(api.current().shownPattern?.cells ?? [])];
      // Nothing more to push: the button says so and is off.
      expect(within(widget()).getByRole('button', { name: 'On projector ✓' })).toBeDisabled();

      await userEvent.click(cell(3, 3));
      expect(api.current().shownPattern?.cells).toEqual(pushedCells);
      const update = within(widget()).getByRole('button', { name: 'Update projector' });
      expect(update).toBeEnabled();

      await userEvent.click(update);
      expect(api.current().shownPattern?.cells[12]).toBe(true);
      expect(within(widget()).getByRole('button', { name: 'On projector ✓' })).toBeDisabled();
    });

    it('Hide takes it off the projector', async () => {
      const api = await renderController(1536);
      expect(within(widget()).queryByRole('button', { name: 'Hide' })).toBeNull();
      await userEvent.click(within(widget()).getByRole('button', { name: 'Show on projector' }));
      await userEvent.click(within(widget()).getByRole('button', { name: 'Hide' }));
      expect(api.current().shownPattern).toBeNull();
      expect(within(widget()).getByRole('button', { name: 'Show on projector' })).toBeEnabled();
    });
  });

  it('Edit patterns… opens the Patterns screen, and Back to game returns', async () => {
    await renderController(1536);
    await userEvent.click(within(widget()).getByRole('button', { name: 'Edit patterns…' }));
    expect(screen.getByRole('region', { name: 'Patterns' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Pattern' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /Back to game/ }));
    expect(widget()).toBeInTheDocument();
  });
});

describe('PatternWidget as a strip (1141 to 1439 px, or wide but short)', () => {
  it('shows the name, the saved-pattern choice and the buttons, with New Game in the top bar', async () => {
    await renderController(1280);
    expect(within(widget()).getByRole('textbox', { name: /Pattern name/ })).toBeInTheDocument();
    expect(within(widget()).getByRole('combobox')).toBeInTheDocument();
    expect(within(widget()).getByRole('button', { name: 'Show on projector' })).toBeInTheDocument();
    // The squares are a picture here, not 25 tiny buttons.
    expect(within(widget()).queryByRole('button', { name: /^Row \d, column \d$/ })).toBeNull();
    expect(within(widget()).getByRole('img', { name: /squares/ })).toBeInTheDocument();
    expect(within(screen.getByRole('banner')).getByRole('button', { name: 'New Game' })).toBeInTheDocument();
  });

  it('is also used in a wide window that is too short for the rail', async () => {
    await renderController(1600, 700);
    expect(within(widget()).queryByRole('button', { name: /^Row \d, column \d$/ })).toBeNull();
    expect(within(screen.getByRole('banner')).getByRole('button', { name: 'New Game' })).toBeInTheDocument();
  });
});

describe('the compact layout (below 1141 px)', () => {
  it('keeps the small Pattern card, which opens the Patterns screen', async () => {
    await renderController(1000);
    expect(screen.queryByRole('region', { name: 'Pattern' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /^Pattern/ }));
    expect(screen.getByRole('region', { name: 'Patterns' })).toBeInTheDocument();
  });
});
