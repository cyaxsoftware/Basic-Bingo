import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BallGrid } from './BallGrid';

describe('BallGrid', () => {
  it('renders 75 ball buttons in B/I/N/G/O rows', () => {
    render(<BallGrid calledNumbers={[]} onToggle={() => undefined} />);
    expect(screen.getAllByRole('button')).toHaveLength(75);
    for (const letter of ['B', 'I', 'N', 'G', 'O']) {
      expect(screen.getByRole('group', { name: `${letter} row` })).toBeInTheDocument();
    }
  });

  it('marks called and current balls', () => {
    render(<BallGrid calledNumbers={[3, 31]} onToggle={() => undefined} />);
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
    render(<BallGrid calledNumbers={[3]} onToggle={onToggle} />);
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
    render(<BallGrid calledNumbers={[]} onToggle={onToggle} />);
    await userEvent.click(screen.getByRole('button', { name: /^O-75/ }));
    expect(onToggle).toHaveBeenCalledWith(75);
  });
});
