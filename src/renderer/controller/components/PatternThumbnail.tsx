import { PATTERN_CELL_COUNT } from '../../../shared/patterns';
import styles from './PatternThumbnail.module.css';

const CELLS = Array.from({ length: PATTERN_CELL_COUNT }, (_, index) => index);

/** A tiny picture of a pattern. Decorative: the title next to it carries the meaning. */
export function PatternThumbnail({ cells }: { readonly cells: readonly boolean[] }) {
  return (
    <span className={styles.thumb} aria-hidden="true">
      {CELLS.map((index) => (
        <span key={index} className={styles.cell} data-on={cells[index] === true} />
      ))}
    </span>
  );
}
