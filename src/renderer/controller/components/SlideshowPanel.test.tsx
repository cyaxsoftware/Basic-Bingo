import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { mediaUrl, type MediaItem } from '../../../shared/media';
import { fail, ok, type CommandResult } from '../../../shared/ipc/contract';
import { appendSlideshowImages } from '../../../shared/media/slideshow';
import { createSnapshotStore } from '../../shared/snapshotStore';
import { createFakeBingoApi, makeSnapshot } from '../../test/fakeBingoApi';
import { ControllerApp } from '../ControllerApp';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const GLOBAL = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const image = (id: string, name: string): MediaItem => ({
  id,
  name,
  format: 'png',
  bytes: 100,
  width: 10,
  height: 10,
  addedAt: '',
  fit: 'fit',
});

async function setup(library: readonly MediaItem[] = [], pickedImages: readonly MediaItem[] = []) {
  const api = createFakeBingoApi(makeSnapshot({ presentationMode: 'slideshow', mediaLibrary: library }));
  vi.mocked(api.importSlideshowImages).mockImplementation(async (collectionId) => {
    const snapshot = api.current();
    const slideshow = appendSlideshowImages(
      snapshot.slideshow,
      collectionId,
      pickedImages,
      snapshot.mediaLibrary,
    );
    api.push({ ...snapshot, slideshow, revision: snapshot.revision + 1 });
    return ok;
  });
  const user = userEvent.setup();
  render(<ControllerApp api={api} store={createSnapshotStore(api)} />);
  const view = within(await screen.findByRole('region', { name: 'Slideshow collections' }));
  const create = async (name: string) => {
    await user.click(view.getByRole('button', { name: 'New collection' }));
    const form = within(view.getByRole('form', { name: 'New collection' }));
    await user.type(form.getByRole('textbox', { name: 'Collection name' }), name);
    await user.click(form.getByRole('button', { name: 'Create' }));
  };
  return { api, user, view, create };
}

describe('Break Slideshow collection management', () => {
  it('imports a deck into the active collection and shows busy and failure states', async () => {
    const { api, view, create, user } = await setup();
    expect(view.queryByRole('button', { name: 'Import PowerPoint…' })).toBeNull();
    await create('Sponsors');
    const collectionId = api.current().slideshow.activeId;
    let finishImport: ((result: CommandResult) => void) | undefined;
    const pendingImport = new Promise<CommandResult>((resolve) => {
      finishImport = resolve;
    });
    vi.mocked(api.importPowerPoint).mockImplementationOnce(() => pendingImport);
    await user.click(view.getByRole('button', { name: 'Import PowerPoint…' }));
    expect(api.importPowerPoint).toHaveBeenCalledExactlyOnceWith(collectionId);
    expect(view.getByRole('button', { name: 'Importing PowerPoint…' })).toBeDisabled();
    await act(async () => finishImport?.(fail('Desktop PowerPoint is unavailable.')));
    expect(view.getByRole('button', { name: 'Import PowerPoint…' })).toBeEnabled();
    expect(screen.getByText('Desktop PowerPoint is unavailable.')).toBeInTheDocument();
  });

  it('edits the shared countdown and toggles its overlay while playing without leaving slideshow', async () => {
    const { api, view, create, user } = await setup([], [image(A, 'Logo.png')]);
    await create('Sponsors');
    await user.click(view.getByRole('button', { name: 'Add images…' }));
    await user.click(view.getByRole('button', { name: 'Start slideshow' }));
    const playing = api.current().slideshowPlayback;
    const settings = view.getByRole('button', { name: 'Countdown settings…' });
    await user.click(settings);
    const dialog = within(screen.getByRole('dialog', { name: 'Slideshow countdown' }));
    const visibility = dialog.getByRole('switch', { name: 'Show timer on slideshow' });
    expect(visibility).toBeChecked();
    await user.click(visibility);
    expect(visibility).not.toBeChecked();
    expect(api.current().slideshow.showCountdown).toBe(false);
    await user.click(dialog.getByRole('button', { name: '2 min' }));
    await user.click(dialog.getByRole('button', { name: 'Start' }));
    expect(api.current().timer).toMatchObject({ status: 'running', durationSeconds: 120 });
    await user.click(visibility);
    expect(visibility).toBeChecked();
    await user.click(dialog.getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(settings).toHaveFocus();
    expect(api.current().presentationMode).toBe('slideshow');
    expect(api.current().slideshowPlayback).toBe(playing);
    expect(api.setPresentationMode).not.toHaveBeenCalled();
  });

  it('starts playback, holds a tapped thumbnail, continues, and stops on the held selection', async () => {
    const { api, view, create, user } = await setup([], [image(A, 'Logo.png'), image(B, 'Menu.png')]);
    await create('Sponsors');
    const start = view.getByRole('button', { name: 'Start slideshow' });
    const stop = view.getByRole('button', { name: 'Stop slideshow' });
    const next = view.getByRole('button', { name: 'Continue slideshow' });
    expect(start).toBeDisabled();
    await user.click(view.getByRole('button', { name: 'Add images…' }));
    await user.click(start);
    expect(view.getByRole('status')).toHaveTextContent('Playing');
    expect(view.getByRole('button', { name: 'Show Logo.png' })).toHaveAttribute('aria-current', 'true');
    await user.click(view.getByRole('button', { name: 'Show Menu.png' }));
    expect(view.getByRole('status')).toHaveTextContent('Slide held');
    expect(view.getByRole('button', { name: 'Show Menu.png' })).toHaveAttribute('aria-current', 'true');
    await user.click(next);
    expect(api.current().slideshowPlayback).toMatchObject({ status: 'playing', mediaId: B });
    await user.click(stop);
    expect(api.current().slideshowPlayback).toEqual({ status: 'stopped', mediaId: B });
    expect(next).toBeDisabled();
    expect(stop).toBeDisabled();
    expect(start).toBeEnabled();
  });

  it('separates creating a collection from choosing one and puts Add images inside the selected collection', async () => {
    const { api, create, view, user } = await setup();
    expect(view.getByText('Create a collection to start adding images.')).toBeInTheDocument();
    expect(view.queryByRole('button', { name: 'Add images…' })).toBeNull();
    expect(view.queryByRole('textbox')).toBeNull();
    await create('Sponsors');
    expect(view.getByText(/This collection is empty/)).toBeInTheDocument();
    const sponsors = api.current().slideshow.activeId;
    await create('Events');
    expect(view.getByRole('button', { name: 'Events' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(view.getByRole('button', { name: 'Sponsors' }));
    await user.click(view.getByRole('button', { name: 'Add images…' }));
    expect(api.importSlideshowImages).toHaveBeenCalledExactlyOnceWith(sponsors);
    expect(api.importImages).not.toHaveBeenCalled();

    await user.click(view.getByText('Collection settings'));
    const field = view.getByRole('textbox', { name: 'Collection name' });
    await user.clear(field);
    await user.type(field, 'Club Announcements');
    expect(view.getByRole('button', { name: 'Club Announcements' })).toHaveAttribute('aria-pressed', 'true');
    expect(field).toHaveFocus();
    await user.clear(field);
    await user.tab();
    expect(field).toHaveValue('Club Announcements');
  });

  it('appends picked images immediately with thumbnails, and supports Original, Fit, and Fill', async () => {
    const gallery = image(GLOBAL, 'Single Image.png');
    const { api, view, create, user } = await setup([gallery], [image(A, 'Logo.png'), image(B, 'Menu.png')]);
    await create('Sponsors');
    expect(view.queryByRole('combobox', { name: 'Library image' })).toBeNull();
    await user.click(view.getByRole('button', { name: 'Add images…' }));
    const rows = () => within(view.getByRole('list', { name: 'Slide order' })).getAllByRole('listitem');
    expect(within(rows()[0]!).getByRole('img', { name: 'Logo.png' })).toHaveAttribute('src', mediaUrl(A));
    expect(within(rows()[1]!).getByRole('img', { name: 'Menu.png' })).toHaveAttribute('src', mediaUrl(B));
    expect(view.queryByText(gallery.name)).toBeNull();
    expect(view.getByRole('button', { name: 'Move Logo.png earlier' })).toBeDisabled();
    await user.click(view.getByRole('button', { name: 'Move Menu.png earlier' }));
    expect(rows()[0]).toHaveTextContent('Menu.png');
    await user.click(view.getByText('Collection settings'));
    await user.selectOptions(view.getByRole('combobox', { name: 'Default image fit' }), 'fill');
    const override = view.getByRole('combobox', { name: 'Image fit for Menu.png' });
    expect(override).toHaveDisplayValue('Use collection fit');
    await user.selectOptions(override, 'fit');
    await user.selectOptions(override, 'fill');
    await user.selectOptions(override, 'original');
    const seconds = view.getByRole('spinbutton', { name: 'Seconds per slide' });
    await user.clear(seconds);
    await user.type(seconds, '20');
    expect(api.current().slideshow.collections[0]?.secondsPerSlide).toBe(20);
    fireEvent.change(seconds, { target: { value: '301' } });
    expect(api.current().slideshow.collections[0]?.secondsPerSlide).toBe(20);
    await user.tab();
    expect(seconds).toHaveValue(20);
    fireEvent.error(view.getByRole('img', { name: 'Menu.png' }));
    expect(view.getByText('Image unavailable')).toBeInTheDocument();
    await user.click(view.getByRole('button', { name: 'Remove Logo.png from collection' }));
    expect(rows()).toHaveLength(1);
    expect(api.current().slideshow.collections[0]).toMatchObject({
      secondsPerSlide: 20,
      fit: 'fill',
      slides: [{ mediaId: B, fit: 'original' }],
    });
    expect(api.current().mediaLibrary).toEqual([gallery]);
    await user.click(screen.getByRole('tab', { name: 'Single Image' }));
    expect(screen.getByRole('button', { name: /Single Image\.png/ })).toBeInTheDocument();
    expect(screen.queryByText('Menu.png')).toBeNull();
  });

  it('confirms collection deletion and keeps the Single Image gallery', async () => {
    const gallery = image(GLOBAL, 'Single Image.png');
    const { api, view, create, user } = await setup([gallery], [image(A, 'Logo.png')]);
    await create('Sponsors');
    await user.click(view.getByRole('button', { name: 'Add images…' }));
    await user.click(view.getByText('Collection settings'));
    const remove = view.getByRole('button', { name: 'Delete collection…' });
    await user.click(remove);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(api.current().slideshow.collections[0]?.slides).toHaveLength(1);
    await user.click(remove);
    const dialog = within(screen.getByRole('dialog', { name: 'Delete “Sponsors”?' }));
    await user.click(dialog.getByRole('button', { name: 'Delete collection' }));
    expect(api.current().slideshow).toEqual({ collections: [], activeId: null });
    expect(api.current().mediaLibrary).toEqual([gallery]);
  });
});
