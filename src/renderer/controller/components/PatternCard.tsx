import type { Ref } from 'react';
import type { ActivePattern } from '../../../shared/patterns';
import { PatternThumbnail } from './PatternThumbnail';
import styles from './PatternCard.module.css';

export interface PatternCardProps {
  readonly active: ActivePattern;
  readonly onOpen: () => void;
  readonly ref?: Ref<HTMLButtonElement>;
}

/** What the game is playing for, always on the game screen. Tapping it opens the Patterns view. */
export function PatternCard({ active, onOpen, ref }: PatternCardProps) {
  return (
    <button ref={ref} type="button" className={styles.card} onClick={onOpen}>
      <PatternThumbnail cells={active.cells} />
      <span className={styles.text}>
        <span className={styles.label}>Pattern</span>
        <span className={styles.title}>{active.title}</span>
      </span>
      {active.editedFromLibrary ? <span className={styles.badge}>Edited</span> : null}
      <span className={styles.go} aria-hidden="true">
        ›
      </span>
    </button>
  );
}
