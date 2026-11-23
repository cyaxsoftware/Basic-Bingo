import { useEffect, useRef, useState, type Ref } from 'react';
import {
  MAX_PATTERN_TITLE_LENGTH,
  PATTERN_CELL_COUNT,
  PATTERN_SIZE,
  sameCells,
  type ActivePattern,
  type Pattern,
  type ShownPattern,
} from '../../../shared/patterns';
import { usePatternTitleField } from '../usePatternTitleField';
import type { UnsavedEdits } from '../useControllerActions';
import styles from './PatternWidget.module.css';
import { SwitchPrompt } from './SwitchPrompt';

export interface PatternWidgetProps {
  /** Rail: tall, with tappable cells. Strip: one compact band above the board, cells shown but not tappable. */
  readonly variant: 'rail' | 'strip';
  readonly library: readonly Pattern[];
  readonly active: ActivePattern;
  /** What the projector is showing now, or null. */
  readonly shown: ShownPattern | null;
  readonly onSwitch: (patternId: string, unsavedEdits: UnsavedEdits) => void;
  readonly onSetCell: (index: number, on: boolean) => void;
  readonly onRename: (title: string) => void;
  readonly onShow: () => void;
  readonly onHide: () => void;
  readonly onEditPatterns: () => void;
  readonly editButtonRef?: Ref<HTMLButtonElement>;
}

const CELLS = Array.from({ length: PATTERN_CELL_COUNT }, (_, index) => index);

/**
 * The pattern, always on the game screen: its name (editable in place), its 5x5 cells, a choice of saved
 * pattern, and the button that pushes it to the projector. Editing here changes only the working copy; the
 * audience sees the last pushed pattern until the operator pushes again. Saving to the library, and the
 * library itself, are on the Patterns screen ("Edit patterns...").
 */
export function PatternWidget({
  variant,
  library,
  active,
  shown,
  onSwitch,
  onSetCell,
  onRename,
  onShow,
  onHide,
  onEditPatterns,
  editButtonRef,
}: PatternWidgetProps) {
  // The saved pattern the operator asked for while the working copy has unsaved edits.
  const [pendingId, setPendingId] = useState<string | null>(null);
  const titleField = usePatternTitleField(active.title, onRename);
  const selectRef = useRef<HTMLSelectElement>(null);

  const pending = pendingId === null ? undefined : library.find((pattern) => pattern.id === pendingId);
  const asking = pending !== undefined;
  const wasAsking = useRef(false);
  useEffect(() => {
    // The prompt takes focus itself when it appears; when it goes, focus returns to the select.
    if (!asking && wasAsking.current) selectRef.current?.focus();
    wasAsking.current = asking;
  }, [asking]);

  const choose = (patternId: string) => {
    if (patternId === active.sourcePatternId) return;
    if (active.editedFromLibrary) setPendingId(patternId);
    else onSwitch(patternId, 'discard');
  };

  const answer = (unsavedEdits: UnsavedEdits) => {
    if (pending) onSwitch(pending.id, unsavedEdits);
    setPendingId(null);
  };

  const onProjector = shown !== null && shown.title === active.title && sameCells(shown.cells, active.cells);
  const showLabel =
    shown === null ? 'Show on projector' : onProjector ? 'On projector ✓' : 'Update projector';

  return (
    <section
      className={styles.root}
      data-variant={variant}
      aria-label="Pattern"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && pendingId !== null) {
          event.stopPropagation();
          setPendingId(null);
        }
      }}
    >
      <div className={styles.cells}>
        {variant === 'rail' ? (
          CELLS.map((index) => {
            const on = active.cells[index] === true;
            return (
              <button
                key={index}
                type="button"
                className={styles.cell}
                aria-pressed={on}
                aria-label={`Row ${Math.floor(index / PATTERN_SIZE) + 1}, column ${(index % PATTERN_SIZE) + 1}`}
                onClick={() => onSetCell(index, !on)}
              />
            );
          })
        ) : (
          // Too small to tap reliably here, so they are a picture; Edit patterns... opens the editor.
          <span className={styles.picture} role="img" aria-label={`${active.title} squares`}>
            {CELLS.map((index) => (
              <span key={index} className={styles.dot} data-on={active.cells[index] === true} />
            ))}
          </span>
        )}
      </div>

      <label className={styles.name}>
        <span className={styles.label}>
          Pattern name {active.editedFromLibrary ? <span className={styles.badge}>Edited</span> : null}
        </span>
        <input
          className={styles.input}
          type="text"
          maxLength={MAX_PATTERN_TITLE_LENGTH}
          value={titleField.value}
          onChange={(event) => titleField.onChange(event.target.value)}
          onBlur={titleField.onBlur}
          onKeyDown={titleField.onKeyDown}
        />
      </label>

      <label className={styles.saved}>
        <span className={styles.label}>Saved pattern</span>
        <select
          ref={selectRef}
          className={styles.select}
          value={active.sourcePatternId ?? ''}
          onChange={(event) => choose(event.target.value)}
        >
          {active.sourcePatternId === null ? (
            <option value="" disabled>
              Not saved in the library
            </option>
          ) : null}
          {library.map((pattern) => (
            <option key={pattern.id} value={pattern.id}>
              {pattern.title}
            </option>
          ))}
        </select>
      </label>

      <div className={styles.actions}>
        <button ref={editButtonRef} type="button" className={styles.button} onClick={onEditPatterns}>
          Edit patterns…
        </button>
        <div className={styles.projector}>
          <button type="button" className={styles.primary} disabled={onProjector} onClick={onShow}>
            {showLabel}
          </button>
          {shown ? (
            <button type="button" className={styles.hide} onClick={onHide}>
              Hide
            </button>
          ) : null}
        </div>
      </div>

      {pending ? (
        <div className={styles.prompt}>
          <SwitchPrompt
            targetTitle={pending.title}
            activeTitle={active.title}
            onAnswer={answer}
            onCancel={() => setPendingId(null)}
          />
        </div>
      ) : null}
    </section>
  );
}
