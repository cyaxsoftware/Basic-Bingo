import { describe, expect, it, vi } from 'vitest';
import { createAppWindow } from './createAppWindow';
import { createControllerWindow } from './controllerWindow';

const window = vi.hoisted(() => ({
  on: vi.fn<(name: string, listener: (event: { preventDefault(): void }) => void) => void>(),
  once: vi.fn(),
}));

vi.mock('./createAppWindow', () => ({
  createAppWindow: vi.fn(() => window),
}));

vi.mock('electron', () => ({
  app: { getVersion: () => '2.4.6' },
  screen: {
    getAllDisplays: () => [{ internal: true, workArea: { x: 0, y: 0, width: 1600, height: 900 } }],
  },
}));

describe('Controller version', () => {
  it('shows the packaged app version in the window title and keeps it after the page loads', () => {
    createControllerWindow('light');
    expect(createAppWindow).toHaveBeenCalledWith(
      'controller',
      expect.objectContaining({ title: 'Basic Bingo v2.4.6 — Controller' }),
    );
    const titleChange = window.on.mock.calls.find(([event]) => event === 'page-title-updated');
    expect(titleChange).toBeDefined();
    const preventDefault = vi.fn();
    titleChange?.[1]({ preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce();
  });
});
