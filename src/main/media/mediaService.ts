/**
 * The media library's file side, owned by the main process.
 *
 * Renderers never touch the disk. Here the main process:
 *  - imports the images the operator picks: checks each one really is a PNG, JPEG, WebP or GIF of a sane size,
 *    copies it into the app's media folder under a generated id (written to a temporary name first and renamed,
 *    so a crash never leaves a half-written image), and adds the entries to the library;
 *  - serves a library image to the windows (through the `bingo-media://<id>` protocol), looking it up BY ID in the
 *    library, so only files the app itself stored can ever be read;
 *  - deletes a removed image's file;
 *  - at startup, reports library images whose file has gone missing.
 *
 * Nothing here imports Electron (the file dialog is passed in), so it is fully unit-testable.
 */
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat, unlink, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fail, ok, type CommandResult } from '../../shared/ipc/contract';
import {
  cleanMediaName,
  findMedia,
  isValidMediaId,
  MAX_IMAGE_BYTES,
  MEDIA_PROTOCOL,
  mediaFileName,
  mimeTypeFor,
  type MediaItem,
} from '../../shared/media';
import type { MediaService } from '../ipc/registerIpcHandlers';
import { slideshowImages } from '../../shared/media/slideshow';
import type { AppStore } from '../state/appStore';
import { readImageInfo, type ImageInfo } from './imageInfo';
import { networkSourceProblem } from './sourceLocation';

export const NOTICE_IMPORT_SKIPPED = 'media-import-skipped';
export const NOTICE_MISSING_FILES = 'media-missing-files';

export interface ImageLibraryOptions {
  readonly store: AppStore;
  /** The media folder (created on first import). */
  readonly directory: string;
  /** Ask the operator for image files (the native dialog). An empty list means they cancelled. */
  readonly pickFiles: () => Promise<readonly string[]>;
  readonly now?: () => Date;
  /** Ids for new images. Defaults to random UUIDs; tests pass something predictable. */
  readonly newId?: () => string;
}

interface Skipped {
  readonly name: string;
  readonly reason: string;
}

export interface ImportReport {
  readonly added: readonly MediaItem[];
  readonly skipped: readonly Skipped[];
}

interface GeneratedImageBatch {
  readonly image: ImageInfo;
  readonly nameAt: (index: number) => string;
}

export class ImageLibraryService implements MediaService {
  private readonly store: AppStore;
  private readonly directory: string;
  private readonly pickFiles: () => Promise<readonly string[]>;
  private readonly now: () => Date;
  private readonly newId: () => string;
  private readonly allocatedIds = new Set<string>();

  constructor(options: ImageLibraryOptions) {
    this.store = options.store;
    this.directory = options.directory;
    this.pickFiles = options.pickFiles;
    this.now = options.now ?? (() => new Date());
    this.newId = options.newId ?? (() => randomUUID());
  }

  /** The IPC entry point: pick files, import them, and say how it went. */
  async importImages(collectionId?: string): Promise<CommandResult> {
    const paths = await this.pickFiles();
    if (paths.length === 0) return ok; // cancelled
    const report = await this.importFiles(paths, collectionId);
    if (report.added.length === 0) {
      return fail(`No images were added. ${describeSkipped(report.skipped)}`);
    }
    if (report.skipped.length > 0) {
      this.store.addNotice({
        id: NOTICE_IMPORT_SKIPPED,
        level: 'warning',
        message: `${report.added.length} image(s) added. Not added: ${describeSkipped(report.skipped)}`,
      });
    }
    return ok;
  }

  /** Copy selected files for the gallery or a collection. One bad file never stops the others. */
  async importFiles(
    paths: readonly string[],
    collectionId?: string,
    batch?: GeneratedImageBatch,
  ): Promise<ImportReport> {
    const added: MediaItem[] = [];
    const skipped: Skipped[] = [];
    for (const [index, source] of paths.entries()) {
      const name = cleanMediaName(batch?.nameAt(index) ?? source);
      try {
        const item = await this.importOne(source, name, batch?.image);
        if (typeof item === 'string') skipped.push({ name, reason: item });
        else added.push(item);
      } catch (error) {
        console.error(`[media] could not import ${source}`, error);
        skipped.push({ name, reason: 'it could not be read or copied' });
      }
      if (batch && skipped.length > 0) {
        // A presentation is one import: a missing slide must not leave half a deck in the collection.
        await Promise.all(added.map((item) => this.deleteFile(item)));
        return { added: [], skipped };
      }
    }
    if (added.length > 0) {
      const result =
        collectionId === undefined
          ? this.store.dispatchMedia({ type: 'addMedia', items: added })
          : this.store.addSlideshowImages(collectionId, added);
      if (!result.ok) {
        // The destination may have been deleted while its file dialog was open.
        await Promise.all(added.map((item) => this.deleteFile(item)));
        return {
          added: [],
          skipped: [...skipped, ...added.map((item) => ({ name: item.name, reason: result.error }))],
        };
      }
      // The first image added to an empty Single Image choice is shown, so "Add images" visibly does something.
      const first = added[0];
      if (collectionId === undefined && first && this.store.getSnapshot().singleImage.imageId === null) {
        this.store.dispatchMedia({ type: 'selectSingleImage', mediaId: first.id });
      }
    }
    return { added, skipped };
  }

  private storedImages(): readonly MediaItem[] {
    const { mediaLibrary, slideshow } = this.store.getSnapshot();
    return [...mediaLibrary, ...slideshowImages(slideshow)];
  }

  /** Returns the new library entry, or the reason the file was skipped. */
  private async importOne(source: string, name: string, expected?: ImageInfo): Promise<MediaItem | string> {
    // Before anything reads the file: the app is offline, so a file on a network share is refused.
    const problem = await networkSourceProblem(source);
    if (problem !== null) return problem;
    const info = await stat(source);
    if (!info.isFile()) return 'it is not a file';
    if (info.size === 0) return 'it is empty';
    if (info.size > MAX_IMAGE_BYTES) return `it is larger than ${MAX_IMAGE_BYTES / (1024 * 1024)} MB`;

    const data = await readFile(source);
    const image = readImageInfo(data);
    if (!image) return 'it is not a PNG, JPEG, WebP or GIF image';
    if (
      expected &&
      (image.format !== expected.format || image.width !== expected.width || image.height !== expected.height)
    ) {
      return 'PowerPoint exported an unexpected image size or format';
    }

    const id = this.newId();
    if (!isValidMediaId(id) || this.allocatedIds.has(id) || findMedia(this.storedImages(), id)) {
      return 'a unique image ID could not be assigned';
    }
    // Gallery and collection files share a directory, including during concurrent imports.
    this.allocatedIds.add(id);
    const item: MediaItem = {
      id,
      name,
      format: image.format,
      bytes: data.length,
      width: image.width,
      height: image.height,
      addedAt: this.now().toISOString(),
      fit: 'fit',
    };
    await mkdir(this.directory, { recursive: true });
    const target = path.join(this.directory, mediaFileName(item));
    const temporary = `${target}.tmp`;
    try {
      await writeFile(temporary, data);
      await rename(temporary, target);
    } catch (error) {
      await rm(temporary, { force: true }).catch((cleanupError: unknown) => {
        console.error('[media] could not remove an incomplete copy', cleanupError);
      });
      throw error;
    }
    return item;
  }

  /** Delete a removed image's file. A file that is already gone is fine; anything else is only logged. */
  async deleteFile(item: MediaItem): Promise<void> {
    try {
      await unlink(path.join(this.directory, mediaFileName(item)));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error(`[media] could not delete the file for ${item.id}`, error);
      }
    }
  }

  /**
   * The bytes of a stored gallery image or slide. Its metadata determines the file name, so a request
   * cannot reach anything outside the media folder.
   */
  async readImage(id: string): Promise<{ readonly data: Buffer; readonly mimeType: string } | null> {
    if (!isValidMediaId(id)) return null;
    const item = findMedia(this.storedImages(), id);
    if (!item) return null;
    try {
      const data = await readFile(path.join(this.directory, mediaFileName(item)));
      return { data, mimeType: mimeTypeFor(item.format) };
    } catch {
      return null;
    }
  }

  /** At startup: tell the operator if any library image's file has gone missing, instead of a broken picture later. */
  async checkFiles(): Promise<void> {
    const missing: string[] = [];
    for (const item of this.storedImages()) {
      try {
        await access(path.join(this.directory, mediaFileName(item)));
      } catch {
        missing.push(item.name);
      }
    }
    if (missing.length > 0) {
      this.store.addNotice({
        id: NOTICE_MISSING_FILES,
        level: 'warning',
        message: `${missing.length} image(s) are missing from the media folder: ${missing.join(', ')}. Remove them or add them again.`,
      });
    }
  }
}

function describeSkipped(skipped: readonly Skipped[]): string {
  return skipped.map((entry) => `${entry.name} (${entry.reason})`).join('; ');
}

// ---------------------------------------------------------------------------
// The bingo-media:// protocol
// ---------------------------------------------------------------------------

export interface MediaResponse {
  readonly status: 200 | 400 | 404;
  readonly mimeType?: string;
  readonly data?: Buffer;
}

/**
 * Answer a `bingo-media://<id>` request. Read-only and restricted: only the exact form `bingo-media://<uuid>` (no
 * path, no query) for an image that is in the library is served; anything else (a path such as `../..`, another id,
 * another scheme) is refused. The Electron glue in main.ts just turns this into a Response.
 */
export async function answerMediaRequest(
  service: Pick<ImageLibraryService, 'readImage'>,
  requestUrl: string,
): Promise<MediaResponse> {
  let url: URL;
  try {
    url = new URL(requestUrl);
  } catch {
    return { status: 400 };
  }
  if (url.protocol !== `${MEDIA_PROTOCOL}:`) return { status: 400 };
  // Exactly bingo-media://<id>: nothing after the id (a trailing slash is what the URL parser adds).
  if ((url.pathname !== '' && url.pathname !== '/') || url.search !== '' || url.hash !== '') {
    return { status: 400 };
  }
  const found = await service.readImage(url.hostname);
  return found ? { status: 200, mimeType: found.mimeType, data: found.data } : { status: 404 };
}
