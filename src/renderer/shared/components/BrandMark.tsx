import { useState } from 'react';
import type { Branding } from '../../../shared/branding/branding';
import { findMedia, mediaUrl, type MediaItem } from '../../../shared/media';
import styles from './BrandMark.module.css';

interface BrandMarkProps {
  readonly branding: Branding;
  readonly library: readonly MediaItem[];
  readonly className?: string | undefined;
}

/** Renders nothing with branding off, so the default layouts use all of their original space. */
export function BrandMark({ branding, library, className }: BrandMarkProps) {
  const [failedLogo, setFailedLogo] = useState<string | null>(null);
  if (!branding) return null;
  const logo =
    branding.logoId && branding.logoId !== failedLogo ? findMedia(library, branding.logoId) : undefined;
  if (!branding.name && !logo) return null;

  return (
    <div className={`${styles.mark} ${className ?? ''}`} data-testid="branding">
      {logo ? (
        <img
          key={logo.id}
          src={mediaUrl(logo.id)}
          alt={branding.name ? '' : logo.name}
          onError={() => setFailedLogo(logo.id)}
        />
      ) : null}
      {branding.name ? <span title={branding.name}>{branding.name}</span> : null}
    </div>
  );
}
