import type { Notice, PersistenceStatus } from '../../../shared/ipc/contract';
import styles from './NoticeArea.module.css';

export interface NoticeAreaProps {
  readonly notices: readonly Notice[];
  readonly persistence: PersistenceStatus;
  readonly actionError: string | null;
  readonly onDismissNotice: (id: string) => void;
  readonly onDismissActionError: () => void;
}

/** Operator-facing warnings: save failures, display loss, rejected commands. */
export function NoticeArea({
  notices,
  persistence,
  actionError,
  onDismissNotice,
  onDismissActionError,
}: NoticeAreaProps) {
  if (notices.length === 0 && persistence.kind === 'ok' && !actionError) return null;

  return (
    <div className={styles.area}>
      {persistence.kind === 'error' && (
        // Not dismissible: it clears itself after the next successful save.
        <div className={styles.notice} data-level="error" role="alert">
          <span>{persistence.message} Calls still work, but may not survive a restart.</span>
        </div>
      )}
      {notices.map((notice) => (
        <div key={notice.id} className={styles.notice} data-level={notice.level} role="alert">
          <span>{notice.message}</span>
          <button type="button" className={styles.dismiss} onClick={() => onDismissNotice(notice.id)}>
            Dismiss
          </button>
        </div>
      ))}
      {actionError && (
        <div className={styles.notice} data-level="error" role="alert">
          <span>{actionError}</span>
          <button type="button" className={styles.dismiss} onClick={onDismissActionError}>
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
