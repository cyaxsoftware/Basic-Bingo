import { useState, type FormEvent } from 'react';
import { MAX_BRAND_NAME_LENGTH, type Branding } from '../../../shared/branding/branding';
import type { MediaItem } from '../../../shared/media';
import { ModalDialog } from './ConfirmDialog';
import styles from './BrandingSettings.module.css';

interface BrandingSettingsProps {
  readonly branding: Branding;
  readonly library: readonly MediaItem[];
  readonly onApply: (branding: Branding) => void;
  readonly onClose: () => void;
}

export function BrandingSettings({ branding, library, onApply, onClose }: BrandingSettingsProps) {
  const [name, setName] = useState(branding?.name ?? '');
  const [logoId, setLogoId] = useState(branding?.logoId ?? '');

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = name.trim();
    onApply(trimmed || logoId ? { name: trimmed, logoId: logoId || null } : null);
  };

  return (
    <ModalDialog
      title="Branding"
      description="Add an optional name or logo to the Controller and Presentation."
      closeLabel="Cancel"
      onClose={onClose}
    >
      <form className={styles.form} onSubmit={save}>
        <label>
          Organization or event name
          <input
            type="text"
            maxLength={MAX_BRAND_NAME_LENGTH}
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
          />
        </label>
        <label>
          Logo
          <select value={logoId} onChange={(event) => setLogoId(event.currentTarget.value)}>
            <option value="">No logo</option>
            {library.map((image) => (
              <option key={image.id} value={image.id}>
                {image.name}
              </option>
            ))}
          </select>
        </label>
        {library.length === 0 ? <p>Add an image to the library to use it as a logo.</p> : null}
        <div className={styles.actions}>
          <button type="submit" className={styles.apply}>
            Apply branding
          </button>
          {branding ? (
            <button type="button" onClick={() => onApply(null)}>
              Clear branding
            </button>
          ) : null}
        </div>
      </form>
    </ModalDialog>
  );
}
