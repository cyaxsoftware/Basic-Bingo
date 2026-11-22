import {
  PRESENTATION_MODE_LABELS,
  type PresentationMode,
} from '../../../shared/presentation/presentationMode';
import styles from './ComingSoon.module.css';

export interface ComingSoonProps {
  readonly mode: PresentationMode;
}

/**
 * Stand-in for the presentation modes that arrive in milestone 4 (slideshow,
 * single image, countdown), so choosing one never leaves the audience with a
 * blank or broken screen.
 */
export function ComingSoon({ mode }: ComingSoonProps) {
  return (
    <section className={styles.root} aria-label={PRESENTATION_MODE_LABELS[mode]}>
      <h1 className={styles.title}>{PRESENTATION_MODE_LABELS[mode]}</h1>
      <p className={styles.note}>Coming soon</p>
    </section>
  );
}
