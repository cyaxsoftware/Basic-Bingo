import { useRef, type KeyboardEvent } from 'react';
import {
  PRESENTATION_MODE_LABELS,
  PRESENTATION_MODES,
  type PresentationMode,
} from '../../../shared/presentation/presentationMode';
import styles from './ModeTabs.module.css';

export interface ModeTabsProps {
  readonly mode: PresentationMode;
  readonly onSelect: (mode: PresentationMode) => void;
  /** Id of the tabpanel these tabs control. */
  readonly panelId: string;
}

export const modeTabId = (mode: PresentationMode) => `mode-tab-${mode}`;

/**
 * What the audience screen shows: Game Board, Slideshow, Single Image
 * or Countdown. The selected tab always mirrors the snapshot, never local state.
 *
 * Activation is manual: arrow keys only move focus, and Enter or Space switches
 * the mode. Switching changes the projector, so it must be a deliberate action
 * and not a side effect of arrowing past a tab.
 */
export function ModeTabs({ mode, onSelect, panelId }: ModeTabsProps) {
  const tabs = useRef(new Map<PresentationMode, HTMLButtonElement>());

  const moveFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    const from = PRESENTATION_MODES.findIndex((m) => tabs.current.get(m) === document.activeElement);
    if (from === -1) return;
    const last = PRESENTATION_MODES.length - 1;
    const to =
      event.key === 'ArrowRight'
        ? (from + 1) % PRESENTATION_MODES.length
        : event.key === 'ArrowLeft'
          ? (from + last) % PRESENTATION_MODES.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null;
    if (to === null) return;
    event.preventDefault();
    const target = PRESENTATION_MODES[to];
    if (target) tabs.current.get(target)?.focus();
  };

  return (
    <div role="tablist" aria-label="Presentation mode" className={styles.tabs} onKeyDown={moveFocus}>
      {PRESENTATION_MODES.map((m) => (
        <button
          key={m}
          ref={(element) => {
            if (element) tabs.current.set(m, element);
            else tabs.current.delete(m);
          }}
          type="button"
          role="tab"
          id={modeTabId(m)}
          className={styles.tab}
          aria-selected={m === mode}
          aria-controls={panelId}
          // Roving tabindex: Tab enters the group on the selected tab, arrows move within it.
          tabIndex={m === mode ? 0 : -1}
          onClick={() => onSelect(m)}
        >
          {PRESENTATION_MODE_LABELS[m]}
        </button>
      ))}
    </div>
  );
}
