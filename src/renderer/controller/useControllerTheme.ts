import { useEffect } from 'react';
import type { ControllerTheme } from '../../shared/theme/controllerTheme';

/**
 * Applies the theme to this window by marking the page's root element; the colors are in controller.css.
 * Only the Controller window calls this, so the Presentation window is never themed.
 */
export function useControllerTheme(theme: ControllerTheme | undefined): void {
  useEffect(() => {
    if (theme === undefined) return;
    document.documentElement.dataset['theme'] = theme;
  }, [theme]);
}
