/**
 * Pure helpers for describing and choosing displays. No Electron imports, so
 * they can be unit-tested with plain objects shaped like Electron's Display.
 */
import type { DisplayInfo, Rect } from '../ipc/contract';

/** The fields of Electron's `Display` that we rely on. */
export interface DisplayLike {
  readonly id: number;
  readonly label?: string;
  readonly bounds: Rect;
  readonly scaleFactor: number;
  readonly internal?: boolean;
}

/**
 * Convert OS displays into operator-friendly {@link DisplayInfo}.
 * Labels show the Windows monitor name when available and the physical
 * resolution (DIP size × scale), which is what operators see in Windows Settings.
 */
export function describeDisplays(
  displays: readonly DisplayLike[],
  primaryDisplayId: number,
  controllerDisplayId: number | null,
): DisplayInfo[] {
  return displays.map((display, index) => {
    const isPrimary = display.id === primaryDisplayId;
    const hostsController = display.id === controllerDisplayId;
    const name = display.label?.trim() || `Display ${index + 1}`;
    const width = Math.round(display.bounds.width * display.scaleFactor);
    const height = Math.round(display.bounds.height * display.scaleFactor);
    const tags = [isPrimary ? 'primary' : null, hostsController ? 'Controller' : null].filter(Boolean);
    const label = `${name} — ${width}×${height}${tags.length ? ` (${tags.join(', ')})` : ''}`;
    return {
      id: display.id,
      label,
      isPrimary,
      isInternal: display.internal === true,
      hostsController,
      bounds: { ...display.bounds },
      scaleFactor: display.scaleFactor,
    };
  });
}

/** Displays that can take a fullscreen Presentation without covering the Controller. */
export function projectableDisplays(displays: readonly DisplayInfo[]): DisplayInfo[] {
  return displays.filter((d) => !d.hostsController);
}

/**
 * Pick the display to pre-select in the Controller: the remembered one if it is
 * still connected and projectable, otherwise the first projectable display.
 */
export function chooseDefaultDisplayId(
  displays: readonly DisplayInfo[],
  preferredDisplayId: number | null,
): number | null {
  const candidates = projectableDisplays(displays);
  const preferred = candidates.find((d) => d.id === preferredDisplayId);
  return (preferred ?? candidates[0])?.id ?? null;
}

export function sameBounds(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}
