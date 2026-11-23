import { useState, type FormEvent } from 'react';
import type { MediaItem } from '../../../shared/media';
import {
  MAX_COLLECTION_NAME,
  MAX_SLIDE_SECONDS,
  slideshowFit,
  type SlideshowCollection,
  type SlideshowCommand,
  type SlideshowState,
} from '../../../shared/media/slideshow';
import { ConfirmDialog } from './ConfirmDialog';
import styles from './SlideshowPanel.module.css';

interface SlideshowPanelProps {
  readonly slideshow: SlideshowState;
  readonly library: readonly MediaItem[];
  readonly onEdit: (command: SlideshowCommand) => void;
  readonly onImport: () => void;
}

function readField(event: FormEvent<HTMLFormElement>, field: string): string {
  event.preventDefault();
  const value = new FormData(event.currentTarget).get(field);
  return typeof value === 'string' ? value.trim() : '';
}

function CollectionEditor({
  collection,
  library,
  onEdit,
}: {
  readonly collection: SlideshowCollection;
  readonly library: readonly MediaItem[];
  readonly onEdit: (command: SlideshowCommand) => void;
}) {
  const { id: collectionId, slides } = collection;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const included = new Set(slides.map((slide) => slide.mediaId));
  const available = library.filter((image) => !included.has(image.id));
  const names = new Map(library.map((image) => [image.id, image.name]));

  return (
    <>
      <div className={styles.settings}>
        <form onSubmit={(event) => onEdit({ type: 'rename', collectionId, name: readField(event, 'name') })}>
          <label>
            Collection name
            <input
              key={collection.name}
              name="name"
              required
              maxLength={MAX_COLLECTION_NAME}
              defaultValue={collection.name}
            />
          </label>
          <button type="submit">Rename</button>
        </form>
        <form
          onSubmit={(event) =>
            onEdit({
              type: 'setInterval',
              collectionId,
              secondsPerSlide: Number(readField(event, 'seconds')),
            })
          }
        >
          <label>
            Seconds per slide
            <input
              key={collection.secondsPerSlide}
              name="seconds"
              type="number"
              required
              min={1}
              max={MAX_SLIDE_SECONDS}
              step={1}
              defaultValue={collection.secondsPerSlide}
            />
          </label>
          <button type="submit">Set interval</button>
        </form>
        <label>
          Collection image fit
          <select
            value={collection.fit}
            onChange={(event) => {
              const fit = slideshowFit.safeParse(event.currentTarget.value);
              if (fit.success) onEdit({ type: 'setFit', collectionId, fit: fit.data });
            }}
          >
            <option value="fit">Fit</option>
            <option value="fill">Fill / Crop</option>
          </select>
        </label>
      </div>

      <div className={styles.slides}>
        <h3>Slides</h3>
        {slides.length === 0 ? (
          <p className={styles.empty}>This collection is empty. Add an image to make its first slide.</p>
        ) : (
          <ol className={styles.order}>
            {slides.map(({ mediaId, fit }, index) => {
              const name = names.get(mediaId) ?? 'Unavailable image';
              return (
                <li key={mediaId} className={styles.slide}>
                  <span className={styles.imageName}>{name}</span>
                  <select
                    aria-label={`Image fit for ${name}`}
                    value={fit ?? ''}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      const override = slideshowFit.nullable().safeParse(value === '' ? null : value);
                      if (override.success)
                        onEdit({ type: 'setSlideFit', collectionId, mediaId, fit: override.data });
                    }}
                  >
                    <option value="">Use collection fit</option>
                    <option value="fit">Fit</option>
                    <option value="fill">Fill / Crop</option>
                  </select>
                  <button
                    type="button"
                    aria-label={`Move ${name} up`}
                    disabled={index === 0}
                    onClick={() => onEdit({ type: 'moveSlide', collectionId, mediaId, direction: 'up' })}
                  >
                    Up
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${name} down`}
                    disabled={index === slides.length - 1}
                    onClick={() => onEdit({ type: 'moveSlide', collectionId, mediaId, direction: 'down' })}
                  >
                    Down
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${name} from collection`}
                    onClick={() => onEdit({ type: 'removeSlide', collectionId, mediaId })}
                  >
                    Remove
                  </button>
                </li>
              );
            })}
          </ol>
        )}
        {available.length > 0 ? (
          <form
            onSubmit={(event) => {
              const mediaId = readField(event, 'image');
              onEdit({ type: 'addSlide', collectionId, mediaId });
              event.currentTarget.reset();
            }}
          >
            <label>
              Library image
              <select name="image" required defaultValue="">
                <option value="" disabled>
                  Choose an image
                </option>
                {available.map((image) => (
                  <option key={image.id} value={image.id}>
                    {image.name}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit">Add slide</button>
          </form>
        ) : (
          <p className={styles.note}>
            {library.length === 0
              ? 'Import images to build this collection.'
              : 'Every library image is already in this collection.'}
          </p>
        )}
      </div>

      <button className={styles.delete} type="button" onClick={() => setConfirmDelete(true)}>
        Delete collection…
      </button>
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
          <p>This removes the collection and its slide settings. Its images stay in the library.</p>
        </ConfirmDialog>
      ) : null}
    </>
  );
}

export function SlideshowPanel({ slideshow, library, onEdit, onImport }: SlideshowPanelProps) {
  const [newName, setNewName] = useState('');
  const active = slideshow.collections.find((entry) => entry.id === slideshow.activeId);
  return (
    <section className={styles.panel} aria-label="Slideshow collections">
      <div className={styles.heading}>
        <div>
          <h2>Break Slideshow</h2>
          <p className={styles.note}>Projector playback is coming soon.</p>
        </div>
        <button type="button" onClick={onImport}>
          Add images…
        </button>
      </div>
      <div className={styles.settings}>
        <label>
          Active collection
          <select
            value={slideshow.activeId ?? ''}
            onChange={(event) => onEdit({ type: 'select', collectionId: event.currentTarget.value || null })}
          >
            <option value="">No collection selected</option>
            {slideshow.collections.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        </label>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const name = newName.trim();
            onEdit({ type: 'create', name });
            if (name) setNewName('');
          }}
        >
          <label>
            New collection name
            <input
              value={newName}
              onChange={(event) => setNewName(event.currentTarget.value)}
              required
              maxLength={MAX_COLLECTION_NAME}
            />
          </label>
          <button type="submit">Create collection</button>
        </form>
      </div>
      {active ? (
        <CollectionEditor key={active.id} collection={active} library={library} onEdit={onEdit} />
      ) : (
        <p className={styles.empty}>
          {slideshow.collections.length === 0
            ? 'Create a collection to organize your slideshow images.'
            : 'Choose a collection to edit its slides.'}
        </p>
      )}
    </section>
  );
}
