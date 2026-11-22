import type { UnsavedEdits } from '../useControllerActions';
import styles from './SwitchPrompt.module.css';

export interface SwitchPromptProps {
  /** The saved pattern the operator asked to switch to. */
  readonly targetTitle: string;
  /** The working pattern, whose edits are not saved. */
  readonly activeTitle: string;
  readonly onAnswer: (unsavedEdits: UnsavedEdits) => void;
  readonly onCancel: () => void;
}

/**
 * The question asked when switching patterns while the working copy has unsaved edits. Inline, not a dialog:
 * nothing changes until it is answered, and Keep editing backs out. Focus starts on the first answer, so the
 * keyboard (and Escape in the parent) keeps working when this replaces the control that was focused.
 */
export function SwitchPrompt({ targetTitle, activeTitle, onAnswer, onCancel }: SwitchPromptProps) {
  return (
    <div className={styles.prompt} aria-live="polite">
      <p className={styles.text}>
        Switching to <strong>{targetTitle}</strong>. Your edits to <strong>{activeTitle}</strong> are not
        saved.
      </p>
      {/* eslint-disable-next-line jsx-a11y/no-autofocus -- focus must follow the control this replaced */}
      <button type="button" className={styles.action} autoFocus onClick={() => onAnswer('update')}>
        Update saved, then switch
      </button>
      <button type="button" className={styles.action} onClick={() => onAnswer('saveAsNew')}>
        Save as new, then switch
      </button>
      <button type="button" className={styles.danger} onClick={() => onAnswer('discard')}>
        Discard edits and switch
      </button>
      <button type="button" className={styles.action} onClick={onCancel}>
        Keep editing
      </button>
    </div>
  );
}
