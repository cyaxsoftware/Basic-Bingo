import { screen, type BrowserWindow } from 'electron';
import { createAppWindow } from './createAppWindow';

const PREFERRED_SIZE = { width: 1280, height: 800 };
const MIN_SIZE = { width: 1024, height: 640 };

/**
 * The operator's touch console. Opens maximized on the laptop's built-in
 * display (falling back to the Windows primary display) so it stays on the
 * laptop when a projector is attached.
 */
export function createControllerWindow(): BrowserWindow {
  const display = screen.getAllDisplays().find((d) => d.internal) ?? screen.getPrimaryDisplay();
  const area = display.workArea;
  const width = Math.min(PREFERRED_SIZE.width, area.width);
  const height = Math.min(PREFERRED_SIZE.height, area.height);

  const window = createAppWindow('controller', {
    title: 'Basic Bingo — Controller',
    x: Math.round(area.x + (area.width - width) / 2),
    y: Math.round(area.y + (area.height - height) / 2),
    width,
    height,
    minWidth: Math.min(MIN_SIZE.width, area.width),
    minHeight: Math.min(MIN_SIZE.height, area.height),
    backgroundColor: '#f4f5f7',
  });

  window.once('ready-to-show', () => {
    window.maximize();
    window.show();
  });
  return window;
}
