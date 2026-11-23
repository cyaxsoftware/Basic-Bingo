import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Notice, PersistenceStatus } from '../../../shared/ipc/contract';
import { NoticeArea } from './NoticeArea';

function renderArea(
  over: { notices?: Notice[]; persistence?: PersistenceStatus; actionError?: string | null } = {},
) {
  const handlers = {
    onDismissNotice: vi.fn(),
    onDismissActionError: vi.fn(),
    onRetrySave: vi.fn(),
    onShowDataFolder: vi.fn(),
  };
  const view = render(
    <NoticeArea
      notices={over.notices ?? []}
      persistence={over.persistence ?? { kind: 'ok' }}
      actionError={over.actionError ?? null}
      {...handlers}
    />,
  );
  return { ...handlers, view };
}

const DISK_FULL: PersistenceStatus = {
  kind: 'error',
  message: "The game could not be saved because the computer's disk is full. Press Try again.",
  problem: 'disk-full',
  failedAt: 'now',
};

describe('NoticeArea', () => {
  it('shows nothing when there is nothing to say', () => {
    const { view } = renderArea();
    expect(view.container).toBeEmptyDOMElement();
  });

  it('a failed save says what happened and offers Try again and Show data folder', async () => {
    const { onRetrySave, onShowDataFolder } = renderArea({ persistence: DISK_FULL });
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('disk is full');
    expect(alert).toHaveTextContent('Calls still work, but may not survive a restart.');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetrySave).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Show data folder' }));
    expect(onShowDataFolder).toHaveBeenCalledTimes(1);
  });

  it('a failed save cannot be dismissed (it clears itself after a successful save)', () => {
    renderArea({ persistence: DISK_FULL });
    expect(screen.queryByRole('button', { name: 'Dismiss' })).not.toBeInTheDocument();
  });

  it('a notice with the data-folder action shows that button beside Dismiss', async () => {
    const notice: Notice = {
      id: 'state-reset-unreadable',
      level: 'error',
      message: 'The saved game was damaged.',
      action: 'showDataFolder',
    };
    const { onShowDataFolder, onDismissNotice } = renderArea({ notices: [notice] });
    await userEvent.click(screen.getByRole('button', { name: 'Show data folder' }));
    expect(onShowDataFolder).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDismissNotice).toHaveBeenCalledWith('state-reset-unreadable');
  });

  it('a notice without an action has only Dismiss', () => {
    renderArea({ notices: [{ id: 'a', level: 'info', message: 'Imported 3 images.' }] });
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Dismiss']);
  });

  it('every button is a touch-sized target (the Controller is used with a finger)', () => {
    // The shared button style sets the project-wide touch minimum.
    renderArea({
      persistence: DISK_FULL,
      notices: [{ id: 'n', level: 'warning', message: 'x', action: 'showDataFolder' }],
    });
    for (const button of screen.getAllByRole('button')) {
      expect(button.className).toMatch(/dismiss/);
    }
  });
});
