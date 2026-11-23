import { useState } from 'react';
import {
  findMedia,
  mediaUrl,
  type FitMode,
  type MediaItem,
  type SingleImageState,
} from '../../../shared/media';
import { ConfirmDialog } from './ConfirmDialog';
import styles from './SingleImagePanel.module.css';

export interface SingleImagePanelProps {
  readonly library: readonly MediaItem[];
  readonly singleImage: SingleImageState;
  readonly onSelect: (mediaId: string | null) => void;
  /** Set how the chosen image meets the screen; each image keeps its own. */
  readonly onFit: (mediaId: string, fit: FitMode) => void;
  readonly onImport: () => void;
  readonly onRemove: (mediaId: string) => void;
}

const FIT_CHOICES: readonly { readonly fit: FitMode; readonly label: string }[] = [
  { fit: 'fit', label: 'Fit' },
  { fit: 'fill', label: 'Fill' },
  { fit: 'original', label: 'Original' },
];

const FIT_HELP: Record<FitMode, string> = {
  fit: 'Fit shows the whole image, with black bars if it does not match the screen.',
  fill: 'Fill covers the whole screen and may crop the edges of the image.',
  original:
    'Original shows the image at its own size, centered. One bigger than the screen is shrunk to fit; a smaller one is not enlarged.',
};

/** The preview cannot know the projector's real resolution, so "Original" is drawn against a 1920 x 1080 screen. */
const REFERENCE_SCREEN_WIDTH = 1920;
const originalWidth = (item: MediaItem): string =>
  `${Math.min(100, (item.width / REFERENCE_SCREEN_WIDTH) * 100)}%`;

const FIT_LABEL: Record<FitMode, string> = { fit: 'Fit', fill: 'Fill', original: 'Original' };

const sizeText = (item: MediaItem): string => `${item.width} × ${item.height}`;

/**
 * The Single Image tab: pick one image from the library to show on the projector, choose how it fits the screen,
 * add images from a file dialog, and remove one. Switching to this tab is what puts the image on the projector, so
 * there is no separate "show" button. The whole panel is the window (the rest of the Controller steps aside).
 */
export function SingleImagePanel({
  library,
  singleImage,
  onSelect,
  onFit,
  onImport,
  onRemove,
}: SingleImagePanelProps) {
  const [removing, setRemoving] = useState(false);
  // Images whose file would not load (missing or damaged): shown as a plain placeholder, never a broken icon.
  const [unloadable, setUnloadable] = useState<ReadonlySet<string>>(new Set());
  const markUnloadable = (id: string) => setUnloadable((current) => new Set(current).add(id));

  const chosen = singleImage.imageId === null ? undefined : findMedia(library, singleImage.imageId);

  return (
    <section className={styles.panel} aria-label="Single image">
      <h2 className={styles.heading}>Single image</h2>

      <div className={styles.show}>
        <div className={styles.previewBox}>
          <div className={styles.preview} data-fit={chosen?.fit ?? 'fit'}>
            {chosen === undefined ? (
              <p className={styles.previewNote}>No image is showing. Choose one below.</p>
            ) : unloadable.has(chosen.id) ? (
              <p className={styles.previewNote}>This image cannot be shown. Its file may be missing.</p>
            ) : (
              <img
                key={chosen.id}
                className={styles.previewImage}
                src={mediaUrl(chosen.id)}
                alt={chosen.name}
                style={chosen.fit === 'original' ? { width: originalWidth(chosen) } : undefined}
                onError={() => markUnloadable(chosen.id)}
              />
            )}
            <span className={styles.tag}>On the projector</span>
          </div>
          {chosen ? (
            <p className={styles.caption}>
              <strong>{chosen.name}</strong> · {sizeText(chosen)}
            </p>
          ) : null}
        </div>

        <div className={styles.controls}>
          <div className={styles.eyebrow} id="fit-label">
            How this image fits the screen
          </div>
          <div className={styles.segments} role="group" aria-labelledby="fit-label">
            {FIT_CHOICES.map(({ fit, label }) => (
              <button
                key={fit}
                type="button"
                className={styles.segment}
                aria-pressed={chosen?.fit === fit}
                disabled={chosen === undefined}
                onClick={() => chosen && onFit(chosen.id, fit)}
              >
                {label}
              </button>
            ))}
          </div>
          <p className={styles.help}>
            {chosen
              ? `${FIT_HELP[chosen.fit]} Each image remembers its own setting.`
              : 'Choose an image to set how it fits the screen.'}
          </p>

          <button type="button" className={styles.primary} onClick={onImport}>
            Add images…
          </button>
          <button
            type="button"
            className={styles.danger}
            disabled={chosen === undefined}
            onClick={() => setRemoving(true)}
          >
            Remove this image…
          </button>
        </div>
      </div>

      <div className={styles.library}>
        <div className={styles.libraryHead}>
          <h3 className={styles.eyebrow}>
            Image library · {library.length} {library.length === 1 ? 'image' : 'images'}
          </h3>
          {library.length > 0 ? <span className={styles.hint}>Tap an image to show it</span> : null}
        </div>

        {library.length === 0 ? (
          <p className={styles.empty}>
            There are no images yet. Press <strong>Add images…</strong> and choose pictures from this computer
            or a USB stick (PNG, JPEG, WebP or GIF). They are copied into the app, so you can remove the stick
            afterwards.
          </p>
        ) : (
          <ul className={styles.thumbs}>
            {library.map((item) => {
              const isChosen = item.id === singleImage.imageId;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className={styles.thumb}
                    aria-pressed={isChosen}
                    aria-label={`${item.name}, ${sizeText(item)}`}
                    title={item.name}
                    onClick={() => onSelect(item.id)}
                  >
                    {unloadable.has(item.id) ? (
                      <span className={styles.thumbMissing}>Missing</span>
                    ) : (
                      <img
                        className={styles.thumbImage}
                        src={mediaUrl(item.id)}
                        alt=""
                        loading="lazy"
                        onError={() => markUnloadable(item.id)}
                      />
                    )}
                    {item.fit === 'fit' ? null : (
                      <span className={styles.thumbFit}>{FIT_LABEL[item.fit]}</span>
                    )}
                    {isChosen ? <span className={styles.thumbOn}>On projector</span> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {removing && chosen ? (
        <ConfirmDialog
          title={`Remove “${chosen.name}”?`}
          confirmLabel="Remove Image"
          onCancel={() => setRemoving(false)}
          onConfirm={() => {
            setRemoving(false);
            onRemove(chosen.id);
          }}
        >
          <p>
            <strong>This deletes the image</strong> from the library and from the app&apos;s storage on this
            computer. It cannot be undone.
          </p>
          <p>The projector will show &ldquo;No image selected&rdquo; until you choose another one.</p>
        </ConfirmDialog>
      ) : null}
    </section>
  );
}
