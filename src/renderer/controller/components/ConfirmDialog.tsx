import { useEffect, useId, useRef, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import styles from './ConfirmDialog.module.css';

export interface ConfirmDialogProps {
  readonly title: string;
  readonly children: ReactNode;
  readonly confirmLabel: string;
  readonly cancelLabel?: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface ModalDialogProps {
  readonly title: string;
  readonly children: ReactNode;
  readonly closeLabel: string;
  readonly onClose: () => void;
  readonly confirmation?: { readonly label: string; readonly onConfirm: () => void };
  readonly description?: string;
}

/**
 * Modal confirmation. Mount it to open it, unmount it to close it.
 *
 * Built by hand rather than with <dialog>.showModal() so that the focus rules
 * behave the same under test and in Electron:
 *  - focus starts on Cancel, so a stray touch or Enter cannot confirm
 *  - Tab and Shift+Tab stay inside the dialog; Escape cancels from anywhere on the page
 *  - clicking the backdrop or the dialog's own text never drops focus to <body>
 *  - focus returns to whatever opened the dialog when it closes
 */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <ModalDialog
      title={title}
      closeLabel={cancelLabel}
      onClose={onCancel}
      confirmation={{ label: confirmLabel, onConfirm }}
    >
      {children}
    </ModalDialog>
  );
}

/** Shared modal shell for settings and confirmations. */
export function ModalDialog({
  title,
  children,
  closeLabel,
  onClose,
  confirmation,
  description,
}: ModalDialogProps) {
  const isConfirmation = confirmation !== undefined;
  const titleId = useId();
  const bodyId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (isConfirmation) closeRef.current?.focus();
    else dialogRef.current?.focus();

    // Pull focus back if something outside the dialog manages to take it.
    const keepFocusInside = (event: FocusEvent) => {
      const dialog = dialogRef.current;
      if (dialog && event.target instanceof Node && !dialog.contains(event.target)) {
        closeRef.current?.focus();
      }
    };
    document.addEventListener('focusin', keepFocusInside);

    return () => {
      document.removeEventListener('focusin', keepFocusInside);
      if (opener?.isConnected) opener.focus();
    };
  }, [isConfirmation]);

  // Document-level, so Escape still works if focus ever ends up on <body>.
  useEffect(() => {
    const cancelOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', cancelOnEscape);
    return () => document.removeEventListener('keydown', cancelOnEscape);
  }, [onClose]);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return;

    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter(
      (element) => !element.matches(':disabled'),
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    // Focus sits on the dialog box itself after a click on its text; Shift+Tab must not leave it.
    if (
      event.shiftKey &&
      (document.activeElement === first || document.activeElement === dialogRef.current)
    ) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    // preventDefault on mousedown keeps focus where it is when the shaded backdrop is clicked.
    <div
      className={styles.backdrop}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) event.preventDefault();
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={confirmation || description ? bodyId : undefined}
        onKeyDown={handleKeyDown}
      >
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
        {description ? (
          <p className={styles.description} id={bodyId}>
            {description}
          </p>
        ) : null}
        <div id={description ? undefined : bodyId} className={styles.body}>
          {children}
        </div>
        <div className={styles.actions}>
          <button ref={closeRef} type="button" className={styles.cancel} onClick={onClose}>
            {closeLabel}
          </button>
          {confirmation ? (
            <button type="button" className={styles.confirm} onClick={confirmation.onConfirm}>
              {confirmation.label}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
