import {
  PRESENTATION_MODE_LABELS,
  type PresentationMode,
} from '../../../shared/presentation/presentationMode';
import styles from './ModePlaceholder.module.css';

export interface ModePlaceholderProps {
  readonly mode: PresentationMode;
}

/**
 * The operator-side stand-in for modes whose controls arrive in milestone 4
 * (slideshow, single image, countdown). It says what the audience sees and that
 * the game is safe, so choosing one never looks like a broken screen.
 */
export function ModePlaceholder({ mode }: ModePlaceholderProps) {
  return (
    <section className={styles.panel} aria-label={`${PRESENTATION_MODE_LABELS[mode]} controls`}>
      <h2 className={styles.title}>{PRESENTATION_MODE_LABELS[mode]}</h2>
      <p>
        Controls for this mode arrive in a later update. The projector shows a “Coming soon” screen until
        then.
      </p>
      <p>Your game is untouched. Choose Game Board to keep calling numbers.</p>
    </section>
  );
}
