import { useId, useState } from 'react';
import { chooseDefaultDisplayId, projectableDisplays } from '../../../shared/displays/displaySelection';
import type { DisplayInfo, PresentationStatus } from '../../../shared/ipc/contract';
import styles from './PresentationControls.module.css';

export interface PresentationControlsProps {
  readonly displays: readonly DisplayInfo[];
  readonly presentation: PresentationStatus;
  readonly preferredDisplayId: number | null;
  readonly onProject: (displayId: number) => void;
  readonly onPreview: () => void;
  readonly onStop: () => void;
}

const NO_SECOND_DISPLAY_HINT = 'No second display. Press Win+P → Extend, or use Preview.';

export function describePresentation(status: PresentationStatus): string {
  switch (status.kind) {
    case 'closed':
      return 'Not projecting';
    case 'opening':
      return 'Opening presentation…';
    case 'preview':
      return 'Preview window open';
    case 'projecting':
      return `Projecting on ${status.displayLabel}`;
  }
}

/** Display picker plus Project / Preview / Stop, with live status. */
export function PresentationControls({
  displays,
  presentation,
  preferredDisplayId,
  onProject,
  onPreview,
  onStop,
}: PresentationControlsProps) {
  const selectId = useId();
  const candidates = projectableDisplays(displays);
  const [chosenId, setChosenId] = useState<number | null>(null);
  // Fall back to the default whenever the operator's choice is no longer connected.
  const selectedId = candidates.some((d) => d.id === chosenId)
    ? chosenId
    : chooseDefaultDisplayId(displays, preferredDisplayId);

  return (
    <div className={styles.controls}>
      <span
        className={styles.status}
        data-kind={presentation.kind}
        title={describePresentation(presentation)}
        role="status"
        aria-live="polite"
      >
        {describePresentation(presentation)}
      </span>

      {candidates.length > 0 ? (
        <>
          <label htmlFor={selectId} className={styles.visuallyHidden}>
            Presentation display
          </label>
          <select
            id={selectId}
            className={styles.select}
            value={selectedId ?? ''}
            onChange={(event) => setChosenId(Number(event.target.value))}
          >
            {candidates.map((display) => (
              <option key={display.id} value={display.id}>
                {display.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={styles.primary}
            disabled={selectedId === null}
            onClick={() => selectedId !== null && onProject(selectedId)}
          >
            Project
          </button>
        </>
      ) : (
        <span className={styles.hint} title={NO_SECOND_DISPLAY_HINT}>
          {NO_SECOND_DISPLAY_HINT}
        </span>
      )}

      <button type="button" className={styles.secondary} onClick={onPreview}>
        Preview
      </button>
      <button
        type="button"
        className={styles.secondary}
        disabled={presentation.kind === 'closed'}
        onClick={onStop}
      >
        Stop
      </button>
    </div>
  );
}
