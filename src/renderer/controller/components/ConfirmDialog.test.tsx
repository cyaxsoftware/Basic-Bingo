import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from './ConfirmDialog';

function Harness({ onConfirm = () => undefined }: { onConfirm?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <button type="button">Other control</button>
      {open ? (
        <ConfirmDialog
          title="Are you sure?"
          confirmLabel="Do it"
          onCancel={() => setOpen(false)}
          onConfirm={() => {
            setOpen(false);
            onConfirm();
          }}
        >
          <p>Details</p>
        </ConfirmDialog>
      ) : null}
    </div>
  );
}

const openDialog = () => userEvent.click(screen.getByRole('button', { name: 'Open' }));

describe('ConfirmDialog', () => {
  it('is a labelled, described modal dialog', async () => {
    render(<Harness />);
    await openDialog();
    const dialog = screen.getByRole('dialog', { name: 'Are you sure?' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleDescription('Details');
  });

  it('starts with focus on Cancel, so Enter or a stray touch cannot confirm', async () => {
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} />);
    await openDialog();
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps Tab and Shift+Tab inside the dialog', async () => {
    render(<Harness />);
    await openDialog();
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    const confirm = screen.getByRole('button', { name: 'Do it' });

    await userEvent.tab();
    expect(confirm).toHaveFocus();
    await userEvent.tab(); // wraps instead of reaching "Other control"
    expect(cancel).toHaveFocus();
    await userEvent.tab({ shift: true }); // wraps backwards
    expect(confirm).toHaveFocus();
  });

  it('pulls focus back if something outside takes it', async () => {
    render(<Harness />);
    await openDialog();
    screen.getByRole('button', { name: 'Other control' }).focus();
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  });

  it('is operable by keyboard: Escape cancels and Enter on Confirm confirms', async () => {
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} />);

    await openDialog();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();

    await openDialog();
    await userEvent.tab();
    await userEvent.keyboard('{Enter}');
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('is operable by touch or pointer', async () => {
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} />);
    await openDialog();
    await userEvent.click(screen.getByRole('button', { name: 'Do it' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['Cancel', () => userEvent.click(screen.getByRole('button', { name: 'Cancel' }))],
    ['Escape', () => userEvent.keyboard('{Escape}')],
    ['Confirm', () => userEvent.click(screen.getByRole('button', { name: 'Do it' }))],
  ])('restores focus to the opening control after %s', async (_how, close) => {
    render(<Harness />);
    await openDialog();
    await close();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open' })).toHaveFocus();
  });
});
