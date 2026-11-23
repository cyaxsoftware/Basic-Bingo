import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fail, ok, type CommandResult } from '../../shared/ipc/contract';
import type { ImageLibraryService } from './mediaService';
import { exportPowerPoint } from './powerPointExport';

interface PowerPointImportOptions {
  readonly media: Pick<ImageLibraryService, 'importFiles'>;
  readonly pickDeck: () => Promise<string | null>;
  readonly exportDeck?: typeof exportPowerPoint;
}

/** Flatten an explicitly chosen file and publish the slides as a single collection update. */
export class PowerPointImportService {
  private importing = false;

  constructor(private readonly options: PowerPointImportOptions) {}

  async importDeck(collectionId: string): Promise<CommandResult> {
    if (this.importing) return fail('A PowerPoint import is already in progress.');
    this.importing = true;
    let directory: string | undefined;
    try {
      const source = await this.options.pickDeck();
      if (source === null) return ok;
      const extension = path.extname(source);
      if (extension.toLowerCase() !== '.pptx') return fail('Choose a .pptx presentation.');

      const exportDirectory = await mkdtemp(path.join(os.tmpdir(), 'bingo-powerpoint-'));
      directory = exportDirectory;
      const convert = this.options.exportDeck ?? exportPowerPoint;
      const { count, width, height } = await convert(source, exportDirectory);
      const title = path.basename(source, extension).slice(0, 150);
      const files = Array.from({ length: count }, (_, index) =>
        path.join(exportDirectory, `slide-${index + 1}.png`),
      );
      const report = await this.options.media.importFiles(files, collectionId, {
        image: { format: 'png', width, height },
        nameAt: (index) => `${title} · Slide ${index + 1}.png`,
      });
      if (report.added.length === count) return ok;
      const skipped = report.skipped[0];
      return fail(
        skipped
          ? `Could not import ${skipped.name}: ${skipped.reason}.`
          : 'The slides could not be added to the collection.',
      );
    } catch (error) {
      return fail(error instanceof Error ? error.message : 'PowerPoint import failed.');
    } finally {
      if (directory) {
        await rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }).catch(
          (error: unknown) => console.error('[powerpoint] could not remove temporary export', error),
        );
      }
      this.importing = false;
    }
  }
}
