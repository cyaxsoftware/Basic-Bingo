/**
 * Watches Windows displays through Electron's `screen` module.
 *
 * Windows often fires bursts of display events (plugging a projector,
 * resuming from sleep, changing scaling), sometimes with transient states.
 * Changes are therefore debounced and the full list is re-read each time,
 * rather than trusting individual add/remove events.
 */
import type { Display, Screen } from 'electron';
import type { DisplayInfo, Rect } from '../../shared/ipc/contract';
import { describeDisplays } from '../../shared/displays/displaySelection';

export type ScreenLike = Pick<
  Screen,
  'getAllDisplays' | 'getPrimaryDisplay' | 'getDisplayMatching' | 'on' | 'removeListener'
>;

const DISPLAY_EVENTS = ['display-added', 'display-removed', 'display-metrics-changed'] as const;
const DEBOUNCE_MS = 300;

export class DisplayManager {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private listener: ((displays: readonly DisplayInfo[]) => void) | null = null;
  private readonly onScreenEvent = () => this.scheduleRefresh();

  constructor(
    private readonly screen: ScreenLike,
    /** Bounds of the Controller window, used to mark which display hosts it. */
    private readonly getControllerBounds: () => Rect | null,
  ) {}

  /** Begin watching. `onChange` receives the full display list after every change. */
  start(onChange: (displays: readonly DisplayInfo[]) => void): void {
    this.listener = onChange;
    for (const event of DISPLAY_EVENTS) this.screen.on(event as 'display-added', this.onScreenEvent);
  }

  stop(): void {
    for (const event of DISPLAY_EVENTS)
      this.screen.removeListener(event as 'display-added', this.onScreenEvent);
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.listener = null;
  }

  /** Read displays now, notify the listener, and return them. */
  refresh(): readonly DisplayInfo[] {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const displays = this.list();
    this.listener?.(displays);
    return displays;
  }

  /** Request a refresh soon (coalesces bursts of events). */
  scheduleRefresh(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.refresh(), DEBOUNCE_MS);
  }

  list(): DisplayInfo[] {
    return describeDisplays(
      this.screen.getAllDisplays(),
      this.screen.getPrimaryDisplay().id,
      this.controllerDisplayId(),
    );
  }

  /** The live Electron display for an id, or undefined if it is no longer connected. */
  findDisplay(displayId: number): Display | undefined {
    return this.screen.getAllDisplays().find((d) => d.id === displayId);
  }

  controllerDisplayId(): number | null {
    const bounds = this.getControllerBounds();
    return bounds ? this.screen.getDisplayMatching(bounds).id : null;
  }

  /** Display the Controller is on, or the primary display. */
  controllerDisplay(): Display {
    const id = this.controllerDisplayId();
    return (id !== null ? this.findDisplay(id) : undefined) ?? this.screen.getPrimaryDisplay();
  }
}
