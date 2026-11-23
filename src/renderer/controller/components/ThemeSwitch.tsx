import type { ControllerTheme } from '../../../shared/theme/controllerTheme';
import styles from './ThemeSwitch.module.css';

export interface ThemeSwitchProps {
  readonly theme: ControllerTheme;
  readonly onChange: (theme: ControllerTheme) => void;
}

/** Light / dark switch for the Controller (not the projector). Shows the mode you are in; one tap flips it. */
export function ThemeSwitch({ theme, onChange }: ThemeSwitchProps) {
  const dark = theme === 'dark';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label="Dark mode"
      title={dark ? 'Dark mode is on. Tap for light.' : 'Light mode is on. Tap for dark.'}
      className={styles.switch}
      onClick={() => onChange(dark ? 'light' : 'dark')}
    >
      {dark ? <Moon /> : <Sun />}
    </button>
  );
}

function Sun() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="4.2" fill="currentColor" />
      <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5.3 5.3l1.7 1.7M17 17l1.7 1.7M18.7 5.3 17 7M7 17l-1.7 1.7" />
      </g>
    </svg>
  );
}

function Moon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" fill="currentColor" />
    </svg>
  );
}
