import { useEffect, useId, useRef, useState } from 'react';
import {
  MAX_PATTERN_TITLE_LENGTH,
  PATTERN_SIZE,
  type ActivePattern,
  type Pattern,
} from '../../../shared/patterns';
import type { UnsavedEdits } from '../useControllerActions';
import styles from './PatternPanel.module.css';

export interface PatternPanelProps {
  readonly library: readonly Pattern[];
  readonly active: ActivePattern;
  readonly onSwitch: (patternId: string, unsavedEdits: UnsavedEdits) => void;
  readonly onSetCell: (index: number, on: boolean) => void;
  readonly onRename: (title: string) => void;
  readonly onUpdateSaved: () => void;
  readonly onSaveAsNew: () => void;
}

const CELLS = Array.from({ length: PATTERN_SIZE * PATTERN_SIZE }, (_, index) => index);

/**
 * The winning pattern for this game. Closed, it is one slim button (a thumbnail, the title and an
 * "Edited" flag) so the ball grid keeps its room. Open, it is a floating sheet rather than a panel in the
 * flow, so editing never pushes a ball below its touch size. It is not modal: Escape or Close shuts it.
 */
export function PatternPanel({
  library,
  active,
  onSwitch,
  onSetCell,
  onRename,
  onUpdateSaved,
  onSaveAsNew,
}: PatternPanelProps) {
  const [open, setOpen] = useState(false);
  // The template the operator asked for while the working copy has unsaved edits.
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const sheetId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  const promptRef = useRef<HTMLDivElement>(null);

  const pending = pendingId === null ? undefined : library.find((pattern) => pattern.id === pendingId);

  // The select is replaced by the question while one is open. Move focus with it, so the keyboard (and
  // Escape) keeps working instead of landing on the page body.
  const asking = pending !== undefined;
  useEffect(() => {
    if (!open) return;
    if (asking) promptRef.current?.querySelector('button')?.focus();
    else selectRef.current?.focus();
  }, [open, asking]);

  const close = () => {
    setOpen(false);
    setPendingId(null);
    setTitleDraft(null);
    toggleRef.current?.focus();
  };

  const commitTitle = () => {
    const title = titleDraft?.trim();
    setTitleDraft(null);
    // An empty title is refused by the game; just show the real one again.
    if (title && title !== active.title) onRename(title);
  };

  const choose = (patternId: string) => {
    if (patternId === active.sourcePatternId) return;
    if (active.editedFromLibrary) setPendingId(patternId);
    else onSwitch(patternId, 'discard');
  };

  const answer = (unsavedEdits: UnsavedEdits) => {
    if (pending) onSwitch(pending.id, unsavedEdits);
    setPendingId(null);
  };

  return (
    <div className={styles.root}>
      <button
        ref={toggleRef}
        type="button"
        className={styles.toggle}
        aria-expanded={open}
        aria-controls={open ? sheetId : undefined}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <Thumbnail cells={active.cells} />
        <span className={styles.toggleText}>
          <span className={styles.toggleLabel}>Pattern</span>
          <span className={styles.toggleTitle}>{active.title}</span>
        </span>
        {active.editedFromLibrary ? <span className={styles.badge}>Edited</span> : null}
      </button>

      {open ? (
        <section
          id={sheetId}
          className={styles.sheet}
          aria-label="Active pattern"
          onKeyDown={(event) => {
            if (event.key !== 'Escape') return;
            event.stopPropagation();
            if (pendingId !== null) setPendingId(null);
            else close();
          }}
        >
          <div className={styles.cells}>
            {CELLS.map((index) => {
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
            })}
          </div>

          <div className={styles.controls}>
            {pending ? (
              <div ref={promptRef} className={styles.prompt} aria-live="polite">
                <p className={styles.promptText}>
                  Switching to <strong>{pending.title}</strong>. Your edits to <strong>{active.title}</strong>{' '}
                  are not saved.
                </p>
                <div className={styles.promptActions}>
                  <button type="button" className={styles.action} onClick={() => answer('update')}>
                    Update saved, then switch
                  </button>
                  <button type="button" className={styles.action} onClick={() => answer('saveAsNew')}>
                    Save as new, then switch
                  </button>
                  <button type="button" className={styles.danger} onClick={() => answer('discard')}>
                    Discard edits and switch
                  </button>
                  <button type="button" className={styles.action} onClick={() => setPendingId(null)}>
                    Keep editing
                  </button>
                </div>
              </div>
            ) : (
              <>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Saved pattern</span>
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

                <label className={styles.field}>
                  <span className={styles.fieldLabel}>
                    Title {active.editedFromLibrary ? <span className={styles.badge}>Edited</span> : null}
                  </span>
                  <input
                    className={styles.title}
                    type="text"
                    maxLength={MAX_PATTERN_TITLE_LENGTH}
                    value={titleDraft ?? active.title}
                    onChange={(event) => setTitleDraft(event.target.value)}
                    onBlur={commitTitle}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') event.currentTarget.blur();
                    }}
                  />
                </label>

                <div className={styles.saveActions}>
                  <button
                    type="button"
                    className={styles.action}
                    disabled={!active.editedFromLibrary}
                    onClick={onUpdateSaved}
                  >
                    Update Saved Pattern
                  </button>
                  <button type="button" className={styles.action} onClick={onSaveAsNew}>
                    Save As New Pattern
                  </button>
                </div>
              </>
            )}
            <button type="button" className={styles.close} onClick={close}>
              Close
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

/** A tiny picture of the pattern. Decorative: the title and the cell buttons carry the meaning. */
function Thumbnail({ cells }: { readonly cells: readonly boolean[] }) {
  return (
    <span className={styles.thumb} aria-hidden="true">
      {CELLS.map((index) => (
        <span key={index} className={styles.thumbCell} data-on={cells[index] === true} />
      ))}
    </span>
  );
}
