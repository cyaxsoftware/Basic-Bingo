import { findMedia, type MediaItem } from '../../../shared/media';
import type { SlideshowState } from '../../../shared/media/slideshow';
import {
  activeSlideshow,
  presentedSlide,
  type SlideshowPlayback,
} from '../../../shared/media/slideshowPlayback';
import type { TimerState } from '../../../shared/timer/timerState';
import { useCountdown } from '../../shared/useCountdown';
import { StageImage } from './SingleImageView';
import styles from './SlideshowView.module.css';

interface SlideshowViewProps {
  readonly slideshow: SlideshowState;
  readonly playback: SlideshowPlayback;
  readonly library: readonly MediaItem[];
  readonly timer: TimerState;
}

export function SlideshowView({ slideshow, playback, library, timer }: SlideshowViewProps) {
  const collection = activeSlideshow(slideshow);
  const slide = presentedSlide(collection, playback);
  const item = slide && (slide.image ?? findMedia(library, slide.mediaId));
  const image = item && collection && slide ? { ...item, fit: slide.fit ?? collection.fit } : null;
  const { time, status } = useCountdown(timer);

  return (
    <section className={styles.stage} aria-label="Break Slideshow">
      <StageImage
        image={image}
        label="Slideshow image"
        emptyMessage={
          slide ? 'Image unavailable' : collection ? 'No slides in this collection' : 'No slideshow selected'
        }
      />
      <div className={styles.overlay} aria-label="Break countdown" role="group">
        {status === 'expired' ? (
          <p>Time to Play!</p>
        ) : (
          <>
            <p role="timer">{time}</p>
            {status === 'paused' ? <p className={styles.paused}>Paused</p> : null}
          </>
        )}
      </div>
    </section>
  );
}
