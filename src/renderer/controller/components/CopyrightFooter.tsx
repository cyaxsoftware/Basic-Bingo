import { CONTACT_EMAIL, CONTACT_WEBSITE, COPYRIGHT_NOTICE } from '../../../shared/appInfo';
import styles from './CopyrightFooter.module.css';

/** A quiet line at the bottom of the Controller (never on the projector). Hidden on short windows. */
export function CopyrightFooter() {
  return (
    <footer className={styles.footer}>
      <span>{COPYRIGHT_NOTICE}</span>
      <span aria-hidden="true">·</span>
      <span>{CONTACT_WEBSITE}</span>
      <span aria-hidden="true">·</span>
      <span>{CONTACT_EMAIL}</span>
    </footer>
  );
}
