import { app, screen, type BrowserWindow } from 'electron';
import { createAppWindow } from './createAppWindow';
import type { ControllerTheme } from '../../shared/theme/controllerTheme';

const PREFERRED_SIZE = { width: 1280, height: 800 };
const MIN_SIZE = { width: 1024, height: 640 };

/**
 * The operator's touch console. Opens maximized on the laptop's built-in
 * display (falling back to the Windows primary display) so it stays on the
 * laptop when a projector is attached.
 */
export function createControllerWindow(theme: ControllerTheme): BrowserWindow {
  const display = screen.getAllDisplays().find((d) => d.internal) ?? screen.getPrimaryDisplay();
  const area = display.workArea;
  const width = Math.min(PREFERRED_SIZE.width, area.width);
  const height = Math.min(PREFERRED_SIZE.height, area.height);

  const window = createAppWindow('controller', {
    title: `Basic Bingo v${app.getVersion()} — Controller`,
    x: Math.round(area.x + (area.width - width) / 2),
    y: Math.round(area.y + (area.height - height) / 2),
    width,
    height,
    minWidth: Math.min(MIN_SIZE.width, area.width),
    minHeight: Math.min(MIN_SIZE.height, area.height),
    // The page's own --surface color for the saved theme, so a dark Controller does not flash light on start.
    backgroundColor: theme === 'dark' ? '#0e1116' : '#f4f5f7',
  });

  // The renderer's static page title would otherwise replace the version in the Windows title bar.
  window.on('page-title-updated', (event) => event.preventDefault());
  window.once('ready-to-show', () => {
    window.maximize();
    window.show();
  });
  return window;
}
