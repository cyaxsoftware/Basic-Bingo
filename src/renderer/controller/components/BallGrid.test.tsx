import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { BingoLetter } from '../../../shared/game/balls';
import { BallGrid } from './BallGrid';

function renderGrid(
  calledNumbers: readonly number[] = [],
  options: {
    disabledRows?: readonly BingoLetter[];
    onToggle?: (ball: number) => void;
    onToggleRow?: (letter: BingoLetter) => void;
  } = {},
) {
  render(
    <BallGrid
      calledNumbers={calledNumbers}
      disabledRows={options.disabledRows ?? []}
      onToggle={options.onToggle ?? (() => undefined)}
      onToggleRow={options.onToggleRow ?? (() => undefined)}
    />,
  );
}

/** A ball button's accessible name is "B-3, not called"; the row letters are "Black out B row". */
const ballButtons = () => screen.getAllByRole('button', { name: /^[BINGO]-\d+,/ });

describe('BallGrid', () => {
  it('renders 75 ball buttons in B/I/N/G/O rows, each with a letter button', () => {
    renderGrid();
    expect(ballButtons()).toHaveLength(75);
    for (const letter of ['B', 'I', 'N', 'G', 'O']) {
      const row = screen.getByRole('group', { name: `${letter} row` });
      expect(within(row).getByRole('button', { name: `Black out ${letter} row` })).toBeInTheDocument();
      expect(within(row).getAllByRole('button', { name: /^[BINGO]-\d+,/ })).toHaveLength(15);
    }
  });

  it('marks called and current balls', () => {
    renderGrid([3, 31]);
    const b3 = screen.getByRole('button', { name: 'B-3, called' });
    const n31 = screen.getByRole('button', { name: 'N-31, current call' });
    const b4 = screen.getByRole('button', { name: 'B-4, not called' });
    expect(b3).toHaveAttribute('aria-pressed', 'true');
    expect(b3).toHaveAttribute('data-status', 'called');
    expect(n31).toHaveAttribute('data-status', 'current');
    expect(b4).toHaveAttribute('aria-pressed', 'false');
  });

  it('keeps the whole cell as the tap target: the button holds the number, uncalled has no called state', async () => {
    const onToggle = vi.fn();
    renderGrid([3], { onToggle });
    const uncalled = screen.getByRole('button', { name: 'B-4, not called' });
    expect(uncalled).toHaveAttribute('data-status', 'uncalled');
    expect(uncalled).toHaveTextContent('4');
    // Only the number is drawn inside: no separate control that could shrink the target.
    expect(uncalled.children).toHaveLength(1);
    // A tap on the drawn number reaches the button's handler.
    await userEvent.click(within(uncalled).getByText('4'));
    expect(onToggle).toHaveBeenCalledWith(4);
  });

  it('calls onToggle with the ball number when tapped', async () => {
    const onToggle = vi.fn();
    renderGrid([], { onToggle });
    await userEvent.click(screen.getByRole('button', { name: /^O-75/ }));
    expect(onToggle).toHaveBeenCalledWith(75);
  });

  describe('blacking out a row', () => {
    it('tapping a row letter asks for that row to be blacked out, and nothing else', async () => {
      const onToggleRow = vi.fn();
      const onToggle = vi.fn();
      renderGrid([], { onToggleRow, onToggle });
      await userEvent.click(screen.getByRole('button', { name: 'Black out N row' }));
      expect(onToggleRow).toHaveBeenCalledExactlyOnceWith('N');
      expect(onToggle).not.toHaveBeenCalled();
    });

    it('shows which rows are blacked out, to the keyboard and screen readers as well', () => {
      renderGrid([], { disabledRows: ['I', 'G'] });
      for (const [letter, out] of [
        ['B', false],
        ['I', true],
        ['N', false],
        ['G', true],
        ['O', false],
      ] as const) {
        expect(screen.getByRole('button', { name: `Black out ${letter} row` })).toHaveAttribute(
          'aria-pressed',
          String(out),
        );
        expect(screen.getByRole('group', { name: `${letter} row` })).toHaveAttribute(
          'data-disabled',
          String(out),
        );
      }
    });

    it('disables every ball in a blacked-out row, and only those', async () => {
      const onToggle = vi.fn();
      renderGrid([], { disabledRows: ['B'], onToggle });
      const row = screen.getByRole('group', { name: 'B row' });
      for (const ball of within(row).getAllByRole('button', { name: /^B-\d+,/ })) expect(ball).toBeDisabled();
      await userEvent.click(screen.getByRole('button', { name: 'B-3, not called' }));
      expect(onToggle).not.toHaveBeenCalled();
      // The letter is how the row comes back, so it stays tappable; other rows are untouched.
      expect(screen.getByRole('button', { name: 'Black out B row' })).toBeEnabled();
      expect(screen.getByRole('button', { name: 'I-17, not called' })).toBeEnabled();
    });

    it('keeps called balls in a blacked-out row called', () => {
      renderGrid([3], { disabledRows: ['B'] });
      expect(screen.getByRole('button', { name: 'B-3, current call' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });
  });
});
