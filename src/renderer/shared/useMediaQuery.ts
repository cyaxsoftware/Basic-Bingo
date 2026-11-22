import { useSyncExternalStore } from 'react';

/**
 * Whether a CSS media query currently matches, kept up to date as the window is resized.
 * Only for the rare case where the layout must change WHICH components exist (not just how they look),
 * for example one control that lives in the top bar on a medium window and in the side rail on a wide one.
 * Where a stylesheet can do the job, use the stylesheet. False where there is no matchMedia (unit tests).
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window.matchMedia !== 'function') return () => undefined;
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => typeof window.matchMedia === 'function' && window.matchMedia(query).matches,
  );
}
