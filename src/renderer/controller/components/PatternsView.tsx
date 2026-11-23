import { useEffect, useRef, useState } from 'react';
import {
  MAX_PATTERN_TITLE_LENGTH,
  PATTERN_CELL_COUNT,
  PATTERN_SIZE,
  type ActivePattern,
  type Pattern,
} from '../../../shared/patterns';
import { NEW_PATTERN_TITLE, type UnsavedEdits } from '../useControllerActions';
import { usePatternTitleField } from '../usePatternTitleField';
import { ConfirmDialog } from './ConfirmDialog';
import { PatternThumbnail } from './PatternThumbnail';
import { SwitchPrompt } from './SwitchPrompt';
import styles from './PatternsView.module.css';

export interface PatternsViewProps {
  readonly library: readonly Pattern[];
  readonly active: ActivePattern;
  readonly onSwitch: (patternId: string, unsavedEdits: UnsavedEdits) => void;
  readonly onSetCell: (index: number, on: boolean) => void;
  readonly onRename: (title: string) => void;
  readonly onUpdateSaved: () => void;
  readonly onSaveAsNew: () => void;
  /** Make a new blank saved pattern and switch to it (after saving or discarding unsaved edits). */
  readonly onNewPattern: (unsavedEdits: UnsavedEdits) => void;
  /** Rename a saved pattern. `followCopy` is true when the working copy is an unedited copy of it. */
  readonly onRenamePattern: (patternId: string, title: string, followCopy: boolean) => void;
  readonly onDuplicatePattern: (patternId: string) => void;
  readonly onDeletePattern: (patternId: string) => void;
}

const CELLS = Array.from({ length: PATTERN_CELL_COUNT }, (_, index) => index);

/** What the operator asked for while the working copy has unsaved edits: a saved pattern, or a new blank one. */
type Pending = { readonly kind: 'switch'; readonly patternId: string } | { readonly kind: 'new' };

/**
 * The pattern screen: the saved library to choose from and manage, and the working pattern for this game to
 * edit. Choosing a saved pattern makes a working COPY of it the game's pattern; edits change only the copy
 * until the operator updates the saved pattern or saves a new one. The library tools (New, Rename, Duplicate,
 * Delete) act on the saved pattern the working copy came from, the highlighted one. The game itself is
 * untouched by being here.
 */
export function PatternsView({
  library,
  active,
  onSwitch,
  onSetCell,
  onRename,
  onUpdateSaved,
  onSaveAsNew,
  onNewPattern,
  onRenamePattern,
  onDuplicatePattern,
  onDeletePattern,
}: PatternsViewProps) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [renaming, setRenaming] = useState<{ readonly id: string; readonly draft: string } | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const titleField = usePatternTitleField(active.title, onRename);
  const titleRef = useRef<HTMLInputElement>(null);

  const selected = library.find((pattern) => pattern.id === active.sourcePatternId);
  const pendingTarget =
    pending === null
      ? undefined
      : pending.kind === 'new'
        ? NEW_PATTERN_TITLE
        : library.find((pattern) => pattern.id === pending.patternId)?.title;

  // The save buttons are replaced by the question while one is open. Move focus with it, so the keyboard
  // (and Escape) keeps working instead of landing on the page body.
  const asking = pendingTarget !== undefined;
  const wasAsking = useRef(false);
  useEffect(() => {
    // The prompt takes focus itself when it appears; when it goes, focus returns to the title.
    if (!asking && wasAsking.current) titleRef.current?.focus();
    wasAsking.current = asking;
  }, [asking]);

  const choose = (patternId: string) => {
    if (patternId === active.sourcePatternId) return;
    if (active.editedFromLibrary) setPending({ kind: 'switch', patternId });
    else onSwitch(patternId, 'discard');
  };

  const startNew = () => {
    if (active.editedFromLibrary) setPending({ kind: 'new' });
    else onNewPattern('discard');
  };

  const answer = (unsavedEdits: UnsavedEdits) => {
    if (pending?.kind === 'new') onNewPattern(unsavedEdits);
    else if (pending) onSwitch(pending.patternId, unsavedEdits);
    setPending(null);
  };

  const commitRename = () => {
    if (!renaming) return;
    const title = renaming.draft.trim();
    const pattern = library.find((candidate) => candidate.id === renaming.id);
    setRenaming(null);
    // An empty or unchanged name changes nothing. A copy that was just following its saved pattern keeps following.
    if (pattern && title && title !== pattern.title) {
      onRenamePattern(pattern.id, title, active.sourcePatternId === pattern.id && !active.editedFromLibrary);
    }
  };

  return (
    <section
      className={styles.view}
      aria-label="Patterns"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && pending !== null) {
          event.stopPropagation();
          setPending(null);
        }
      }}
    >
      <div className={styles.library}>
        <h2 className={styles.heading}>Saved patterns</h2>
        <ul className={styles.list}>
          {library.map((pattern) => {
            const isSelected = pattern.id === active.sourcePatternId;
            return (
              <li key={pattern.id}>
                {renaming?.id === pattern.id ? (
                  <input
                    className={styles.rename}
                    type="text"
                    aria-label={`Rename ${pattern.title}`}
                    maxLength={MAX_PATTERN_TITLE_LENGTH}
                    value={renaming.draft}
                    // eslint-disable-next-line jsx-a11y/no-autofocus -- the field replaces the button that was tapped
                    autoFocus
                    onFocus={(event) => event.currentTarget.select()}
                    onChange={(event) => setRenaming({ id: pattern.id, draft: event.target.value })}
                    onBlur={commitRename}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') event.currentTarget.blur();
                      if (event.key === 'Escape') {
                        event.stopPropagation();
                        setRenaming(null);
                      }
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className={styles.item}
                    aria-current={isSelected ? 'true' : undefined}
                    onClick={() => choose(pattern.id)}
                  >
                    <PatternThumbnail cells={pattern.cells} />
                    <span className={styles.itemTitle}>{pattern.title}</span>
                  </button>
                )}
              </li>
            );
          })}
        </ul>

        <div className={styles.tools}>
          <button type="button" className={styles.tool} onClick={startNew}>
            Add pattern
          </button>
          <button
            type="button"
            className={styles.tool}
            disabled={!selected}
            onClick={() => selected && setRenaming({ id: selected.id, draft: selected.title })}
          >
            Rename
          </button>
          <button
            type="button"
            className={styles.tool}
            disabled={!selected}
            onClick={() => selected && onDuplicatePattern(selected.id)}
          >
            Duplicate
          </button>
          <button
            type="button"
            className={styles.toolDanger}
            disabled={!selected}
            onClick={() => setConfirmingDelete(true)}
          >
            Delete
          </button>
        </div>
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
            value={titleField.value}
            onChange={(event) => titleField.onChange(event.target.value)}
            onBlur={titleField.onBlur}
            onKeyDown={titleField.onKeyDown}
          />
        </label>

        {pendingTarget !== undefined ? (
          <SwitchPrompt
            targetTitle={pendingTarget}
            activeTitle={active.title}
            onAnswer={answer}
            onCancel={() => setPending(null)}
          />
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

      {confirmingDelete && selected ? (
        <ConfirmDialog
          title={`Delete “${selected.title}”?`}
          confirmLabel="Delete Pattern"
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={() => {
            setConfirmingDelete(false);
            onDeletePattern(selected.id);
          }}
        >
          <p>
            <strong>This removes it from the saved patterns.</strong> It cannot be undone.
          </p>
          <p>
            <strong>Kept:</strong> the pattern in this game stays exactly as it is, as one that is not in the
            saved library, so nothing changes on the projector. Use Save As New Pattern to keep it.
          </p>
        </ConfirmDialog>
      ) : null}
    </section>
  );
}
