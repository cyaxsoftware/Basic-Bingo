import type { Notice, PersistenceStatus } from '../../../shared/ipc/contract';
import styles from './NoticeArea.module.css';

export interface NoticeAreaProps {
  readonly notices: readonly Notice[];
  readonly persistence: PersistenceStatus;
  readonly actionError: string | null;
  readonly onDismissNotice: (id: string) => void;
  readonly onDismissActionError: () => void;
  /** Tries the save again after a failed save. */
  readonly onRetrySave: () => void;
  /** Opens the data folder in Windows Explorer. */
  readonly onShowDataFolder: () => void;
}

/** Operator-facing warnings: save failures, display loss, rejected commands. */
export function NoticeArea({
  notices,
  persistence,
  actionError,
  onDismissNotice,
  onDismissActionError,
  onRetrySave,
  onShowDataFolder,
}: NoticeAreaProps) {
  if (notices.length === 0 && persistence.kind === 'ok' && !actionError) return null;

  return (
    <div className={styles.area}>
      {persistence.kind === 'error' && (
        // Not dismissible: it clears itself after the next successful save, so it offers to try again now.
        <div className={styles.notice} data-level="error">
          <span role="alert">{persistence.message} Calls still work, but may not survive a restart.</span>
          <span className={styles.actions}>
            <button type="button" className={styles.dismiss} onClick={onRetrySave}>
              Try again
            </button>
            <button type="button" className={styles.dismiss} onClick={onShowDataFolder}>
              Show data folder
            </button>
          </span>
        </div>
      )}
      {notices.map((notice) => (
        <div key={notice.id} className={styles.notice} data-level={notice.level}>
          <span role={notice.level === 'info' ? 'status' : 'alert'}>{notice.message}</span>
          <span className={styles.actions}>
            {notice.action === 'showDataFolder' ? (
              <button type="button" className={styles.dismiss} onClick={onShowDataFolder}>
                Show data folder
              </button>
            ) : null}
            <button type="button" className={styles.dismiss} onClick={() => onDismissNotice(notice.id)}>
              Dismiss
            </button>
          </span>
        </div>
      ))}
      {actionError && (
        <div className={styles.notice} data-level="error">
          <span role="alert">{actionError}</span>
          <button type="button" className={styles.dismiss} onClick={onDismissActionError}>
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
