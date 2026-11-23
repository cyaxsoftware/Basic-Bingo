import { useState } from 'react';
import { mediaUrl, type MediaItem } from '../../../shared/media';
import styles from './SingleImageView.module.css';

export interface SingleImageViewProps {
  /** The chosen library image, or null when none is chosen. */
  readonly image: MediaItem | null;
}

/**
 * Single Image mode: exactly one image, held on screen until the operator changes it or the mode. No countdown, no
 * rotation, nothing else drawn. Fit shows all of it (black bars if it does not match the screen); Fill covers the
 * screen (and may crop). With no image chosen, or one whose file cannot be loaded, the audience sees a calm plain
 * screen with a short message, never a broken-image icon. Display only, like everything in this window.
 */
export function SingleImageView({ image }: SingleImageViewProps) {
  // Keyed by image id, so choosing another image starts with a fresh "it loads" assumption.
  return <Shown key={image?.id ?? 'none'} image={image} />;
}

function Shown({ image }: SingleImageViewProps) {
  const [failed, setFailed] = useState(false);

  if (image === null) {
    return (
      <section className={styles.stage} aria-label="Single image" data-state="none">
        <p className={styles.note}>No image selected</p>
      </section>
    );
  }
  if (failed) {
    return (
      <section className={styles.stage} aria-label="Single image" data-state="unavailable">
        <p className={styles.note}>Image unavailable</p>
      </section>
    );
  }
  return (
    <section className={styles.stage} aria-label="Single image" data-state="image" data-fit={image.fit}>
      <img
        className={styles.image}
        src={mediaUrl(image.id)}
        alt={image.name}
        onError={() => setFailed(true)}
      />
    </section>
  );
}
