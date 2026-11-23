import { useState, type FormEvent } from 'react';
import { mediaUrl, type MediaItem } from '../../../shared/media';
import {
  MAX_COLLECTION_NAME,
  MAX_SLIDE_SECONDS,
  collectionName,
  slideFit,
  slideSeconds,
  showsSlideshowCountdown,
  slideshowFit,
  type SlideshowCollection,
  type SlideshowCommand,
  type SlideshowState,
} from '../../../shared/media/slideshow';
import {
  activeSlideshow,
  presentedSlide,
  type SlideshowPlayback,
  type SlideshowPlaybackCommand,
} from '../../../shared/media/slideshowPlayback';
import { ConfirmDialog, ModalDialog } from './ConfirmDialog';
import { CountdownPanel, type CountdownPanelProps } from './CountdownPanel';
import { ArrowLeftIcon, ArrowRightIcon, TrashIcon } from './icons';
import styles from './SlideshowPanel.module.css';

interface SlideshowPanelProps {
  readonly slideshow: SlideshowState;
  readonly playback: SlideshowPlayback;
  readonly countdown: CountdownPanelProps;
  readonly library: readonly MediaItem[];
  readonly onEdit: (command: SlideshowCommand) => void;
  readonly onImport: (collectionId: string) => void;
  readonly onImportPowerPoint: (collectionId: string) => void;
  readonly importingPowerPoint: boolean;
  readonly onPlayback: (command: SlideshowPlaybackCommand) => void;
}

function readField(event: FormEvent<HTMLFormElement>, field: string): string {
  event.preventDefault();
  const value = new FormData(event.currentTarget).get(field);
  return typeof value === 'string' ? value.trim() : '';
}

function Thumbnail({
  image,
  slideNumber,
}: {
  readonly image: MediaItem | undefined;
  readonly slideNumber: number;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <span className={styles.thumbnail}>
      {image && !failed ? (
        <img src={mediaUrl(image.id)} alt={image.name} loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <span>Image unavailable</span>
      )}
      <span className={styles.position} aria-hidden="true">
        {slideNumber}
      </span>
    </span>
  );
}

function CollectionEditor({
  collection,
  library,
  onEdit,
  onImport,
  onImportPowerPoint,
  importingPowerPoint,
  playback,
  onPlayback,
  onOpenCountdown,
}: Omit<SlideshowPanelProps, 'slideshow' | 'countdown'> & {
  readonly collection: SlideshowCollection;
  readonly onOpenCountdown: () => void;
}) {
  const { id: collectionId, slides } = collection;
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Snapshots contain valid values, while an input may be temporarily blank or contain trailing spaces.
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [secondsDraft, setSecondsDraft] = useState<string | null>(null);
  const legacyImages = new Map(library.map((image) => [image.id, image]));
  const current = presentedSlide(collection, playback);

  return (
    <div className={styles.editor}>
      <h2 title={collection.name}>{collection.name}</h2>
      <div className={styles.slideBar}>
        <button className={styles.primary} type="button" onClick={() => onImport(collectionId)}>
          Add images…
        </button>
        <button type="button" disabled={importingPowerPoint} onClick={() => onImportPowerPoint(collectionId)}>
          {importingPowerPoint ? 'Importing PowerPoint…' : 'Import PowerPoint…'}
        </button>
        <span>
          {slides.length} {slides.length === 1 ? 'slide' : 'slides'}
        </span>
      </div>
      <div className={styles.playback} role="group" aria-label="Slideshow playback">
        <button
          className={styles.primary}
          type="button"
          aria-label="Start slideshow"
          disabled={!current || playback.status !== 'stopped'}
          onClick={() => onPlayback({ type: 'start' })}
        >
          Start
        </button>
        <button
          type="button"
          aria-label="Stop slideshow"
          disabled={playback.status === 'stopped'}
          onClick={() => onPlayback({ type: 'stop' })}
        >
          Stop
        </button>
        <button
          type="button"
          aria-label="Continue slideshow"
          disabled={playback.status !== 'held'}
          onClick={() => onPlayback({ type: 'continue' })}
        >
          Continue
        </button>
        <p role="status">
          {playback.status === 'held' ? 'Slide held' : playback.status === 'playing' ? 'Playing' : 'Stopped'}
        </p>
        <button type="button" aria-haspopup="dialog" onClick={onOpenCountdown}>
          Countdown settings…
        </button>
      </div>
      {slides.length === 0 ? (
        <p className={styles.empty}>This collection is empty. Add images to create its first slides.</p>
      ) : (
        <ol className={styles.order} aria-label="Slide order">
          {slides.map(({ mediaId, fit, image: owned }, index) => {
            const image = owned ?? legacyImages.get(mediaId);
            const name = image?.name ?? 'Unavailable image';
            return (
              <li key={mediaId} className={styles.slide}>
                <div className={styles.slideActions}>
                  <button
                    type="button"
                    className={styles.iconButton}
                    aria-label={`Move ${name} earlier`}
                    title="Move earlier"
                    disabled={index === 0}
                    onClick={() => onEdit({ type: 'moveSlide', collectionId, mediaId, direction: 'up' })}
                  >
                    <ArrowLeftIcon />
                  </button>
                  <button
                    type="button"
                    className={styles.iconButton}
                    aria-label={`Move ${name} later`}
                    title="Move later"
                    disabled={index === slides.length - 1}
                    onClick={() => onEdit({ type: 'moveSlide', collectionId, mediaId, direction: 'down' })}
                  >
                    <ArrowRightIcon />
                  </button>
                  <button
                    type="button"
                    className={`${styles.iconButton} ${styles.removeSlide}`}
                    aria-label={`Remove ${name} from collection`}
                    title="Remove from collection"
                    onClick={() => onEdit({ type: 'removeSlide', collectionId, mediaId })}
                  >
                    <TrashIcon />
                  </button>
                </div>
                <button
                  type="button"
                  className={styles.showSlide}
                  aria-label={`Show ${name}`}
                  aria-current={current?.mediaId === mediaId ? 'true' : undefined}
                  onClick={() => onPlayback({ type: 'hold', mediaId })}
                >
                  <Thumbnail image={image} slideNumber={index + 1} />
                </button>
                <span className={styles.imageName} title={name}>
                  {name}
                </span>
                <label>
                  Image fit
                  <select
                    aria-label={`Image fit for ${name}`}
                    value={fit ?? ''}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      const override = slideFit.safeParse(value === '' ? null : value);
                      if (override.success)
                        onEdit({ type: 'setSlideFit', collectionId, mediaId, fit: override.data });
                    }}
                  >
                    <option value="">Use collection fit</option>
                    <option value="original">Original</option>
                    <option value="fit">Fit</option>
                    <option value="fill">Fill</option>
                  </select>
                </label>
              </li>
            );
          })}
        </ol>
      )}

      <details className={styles.details}>
        <summary>Collection settings</summary>
        <div className={styles.settings}>
          <label>
            Collection name
            <input
              maxLength={MAX_COLLECTION_NAME}
              value={nameDraft ?? collection.name}
              onChange={(event) => {
                const draft = event.currentTarget.value;
                setNameDraft(draft);
                const name = collectionName.safeParse(draft);
                if (name.success) onEdit({ type: 'rename', collectionId, name: name.data });
              }}
              onBlur={() => setNameDraft(null)}
            />
          </label>
          <label>
            Seconds per slide
            <input
              type="number"
              min={1}
              max={MAX_SLIDE_SECONDS}
              step={1}
              value={secondsDraft ?? collection.secondsPerSlide}
              onChange={(event) => {
                setSecondsDraft(event.currentTarget.value);
                const seconds = slideSeconds.safeParse(event.currentTarget.valueAsNumber);
                if (seconds.success)
                  onEdit({ type: 'setInterval', collectionId, secondsPerSlide: seconds.data });
              }}
              onBlur={() => setSecondsDraft(null)}
            />
          </label>
          <label>
            Default image fit
            <select
              value={collection.fit}
              onChange={(event) => {
                const fit = slideshowFit.safeParse(event.currentTarget.value);
                if (fit.success) onEdit({ type: 'setFit', collectionId, fit: fit.data });
              }}
            >
              <option value="fit">Fit</option>
              <option value="fill">Fill</option>
            </select>
          </label>
          <button className={styles.delete} type="button" onClick={() => setConfirmDelete(true)}>
            Delete collection…
          </button>
        </div>
      </details>
      {confirmDelete ? (
        <ConfirmDialog
          title={`Delete “${collection.name}”?`}
          confirmLabel="Delete collection"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            setConfirmDelete(false);
            onEdit({ type: 'delete', collectionId });
          }}
        >
          <p>This removes the collection and its slides from Basic Bingo. Your original files are kept.</p>
        </ConfirmDialog>
      ) : null}
    </div>
  );
}

export function SlideshowPanel({
  slideshow,
  playback,
  countdown,
  library,
  onEdit,
  onImport,
  onImportPowerPoint,
  importingPowerPoint,
  onPlayback,
}: SlideshowPanelProps) {
  const [creating, setCreating] = useState(false);
  const [countdownOpen, setCountdownOpen] = useState(false);
  const active = activeSlideshow(slideshow);
  return (
    <>
      <section className={styles.panel} aria-label="Slideshow collections">
        <aside className={styles.sidebar} aria-label="Collections">
          <h2>Collections</h2>
          {slideshow.collections.length > 0 ? (
            <ul className={styles.collections}>
              {slideshow.collections.map((entry) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    aria-pressed={entry.id === slideshow.activeId}
                    onClick={() => onEdit({ type: 'select', collectionId: entry.id })}
                  >
                    {entry.name}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {creating ? (
            <form
              aria-label="New collection"
              className={styles.create}
              onSubmit={(event) => {
                const name = readField(event, 'newName');
                onEdit({ type: 'create', name });
                if (name) setCreating(false);
              }}
            >
              <label>
                Collection name
                <input name="newName" required maxLength={MAX_COLLECTION_NAME} autoFocus />
              </label>
              <div className={styles.slideActions}>
                <button type="submit">Create</button>
                <button type="button" onClick={() => setCreating(false)}>
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button type="button" onClick={() => setCreating(true)}>
              New collection
            </button>
          )}
        </aside>
        {active ? (
          <CollectionEditor
            key={active.id}
            collection={active}
            library={library}
            onEdit={onEdit}
            onImport={onImport}
            onImportPowerPoint={onImportPowerPoint}
            importingPowerPoint={importingPowerPoint}
            playback={playback}
            onPlayback={onPlayback}
            onOpenCountdown={() => setCountdownOpen(true)}
          />
        ) : (
          <div className={styles.editor}>
            <h2>Slideshow</h2>
            <p className={styles.empty}>
              {slideshow.collections.length === 0
                ? 'Create a collection to start adding images.'
                : 'Choose a collection to view its slides.'}
            </p>
            <button
              className={styles.countdownSettings}
              type="button"
              aria-haspopup="dialog"
              onClick={() => setCountdownOpen(true)}
            >
              Countdown settings…
            </button>
          </div>
        )}
      </section>
      {countdownOpen ? (
        <ModalDialog title="Slideshow countdown" closeLabel="Done" onClose={() => setCountdownOpen(false)}>
          <label className={styles.countdownToggle}>
            <input
              type="checkbox"
              role="switch"
              checked={showsSlideshowCountdown(slideshow)}
              onChange={(event) =>
                onEdit({ type: 'setCountdownVisible', visible: event.currentTarget.checked })
              }
            />
            Show timer on slideshow
          </label>
          <CountdownPanel {...countdown} compact />
        </ModalDialog>
      ) : null}
    </>
  );
}
