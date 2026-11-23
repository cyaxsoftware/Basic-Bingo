import { z } from 'zod';
import { findMedia, isValidMediaId, type MediaItem } from '../media';

export const MAX_BRAND_NAME_LENGTH = 60;

const brandingSchema = z
  .strictObject({
    name: z.string().trim().max(MAX_BRAND_NAME_LENGTH),
    logoId: z.string().refine(isValidMediaId).nullable(),
  })
  .refine(({ name, logoId }) => name !== '' || logoId !== null);

export type Branding = Readonly<z.infer<typeof brandingSchema>> | null;

/** A null result explicitly clears branding. Undefined means malformed input. */
export function parseBranding(input: unknown): Branding | undefined {
  const result = brandingSchema.nullable().safeParse(input);
  return result.success ? result.data : undefined;
}

/** Keep the name if its logo is removed from the shared image library. */
export function keepAvailableBranding(branding: Branding, library: readonly MediaItem[]): Branding {
  if (!branding?.logoId || findMedia(library, branding.logoId)) return branding;
  return branding.name ? { name: branding.name, logoId: null } : null;
}
