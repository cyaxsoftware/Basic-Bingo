import { useEffect, useRef, useState } from 'react';
import {
  MAX_PATTERN_TITLE_LENGTH,
  PATTERN_CELL_COUNT,
  PATTERN_SIZE,
  type ActivePattern,
  type Pattern,
} from '../../../shared/patterns';
import type { UnsavedEdits } from '../useControllerActions';
import { PatternThumbnail } from './PatternThumbnail';
import styles from './PatternsView.module.css';

export interface PatternsViewProps {
  readonly library: readonly Pattern[];
  readonly active: ActivePattern;
  readonly onSwitch: (patternId: string, unsavedEdits: UnsavedEdits) => void;
  readonly onSetCell: (index: number, on: boolean) => void;
  readonly onRename: (title: string) => void;
  readonly onUpdateSaved: () => void;
  readonly onSaveAsNew: () => void;
}

const CELLS = Array.from({ length: PATTERN_CELL_COUNT }, (_, index) => index);

/**
 * The pattern screen: the saved library to choose from, and the working pattern for this game to edit.
 * Choosing a saved pattern makes a working COPY of it the game's pattern; edits change only the copy until
 * the operator updates the saved pattern or saves a new one. The game itself is untouched by being here.
 */
export function PatternsView({
  library,
  active,
  onSwitch,
  onSetCell,
  onRename,
  onUpdateSaved,
  onSaveAsNew,
}: PatternsViewProps) {
  // The template the operator asked for while the working copy has unsaved edits.
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const promptRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  const pending = pendingId === null ? undefined : library.find((pattern) => pattern.id === pendingId);

  // The save buttons are replaced by the question while one is open. Move focus with it, so the keyboard
  // (and Escape) keeps working instead of landing on the page body.
  const asking = pending !== undefined;
  const wasAsking = useRef(false);
  useEffect(() => {
    if (asking) promptRef.current?.querySelector('button')?.focus();
    else if (wasAsking.current) titleRef.current?.focus();
    wasAsking.current = asking;
  }, [asking]);

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
    <section
      className={styles.view}
      aria-label="Patterns"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && pendingId !== null) {
          event.stopPropagation();
          setPendingId(null);
        }
      }}
    >
      <div className={styles.library}>
        <h2 className={styles.heading}>Saved patterns</h2>
        <ul className={styles.list}>
          {library.map((pattern) => {
            const selected = pattern.id === active.sourcePatternId;
            return (
              <li key={pattern.id}>
                <button
                  type="button"
                  className={styles.item}
                  aria-current={selected ? 'true' : undefined}
                  onClick={() => choose(pattern.id)}
                >
                  <PatternThumbnail cells={pattern.cells} />
                  <span className={styles.itemTitle}>{pattern.title}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className={styles.editor}>
        <h2 className={styles.heading}>This game</h2>
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
      </div>

      <div className={styles.controls}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>
            Title {active.editedFromLibrary ? <span className={styles.badge}>Edited</span> : null}
          </span>
          <input
            ref={titleRef}
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

        {pending ? (
          <div ref={promptRef} className={styles.prompt} aria-live="polite">
            <p className={styles.promptText}>
              Switching to <strong>{pending.title}</strong>. Your edits to <strong>{active.title}</strong> are
              not saved.
            </p>
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
        ) : (
          <>
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
            {active.sourcePatternId === null ? (
              <p className={styles.note}>
                This pattern is not in the saved library. Save it as new to keep it.
              </p>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
