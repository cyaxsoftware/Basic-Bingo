import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { MediaItem } from '../../../shared/media';
import { createSnapshotStore } from '../../shared/snapshotStore';
import { createFakeBingoApi, makeSnapshot } from '../../test/fakeBingoApi';
import { ControllerApp } from '../ControllerApp';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const image = (id: string, name: string): MediaItem => ({
  id,
  name,
  format: 'png',
  bytes: 100,
  width: 10,
  height: 10,
  addedAt: '',
  fit: 'original',
});

async function setup(library: readonly MediaItem[] = []) {
  const api = createFakeBingoApi(makeSnapshot({ presentationMode: 'slideshow', mediaLibrary: library }));
  const user = userEvent.setup();
  render(<ControllerApp api={api} store={createSnapshotStore(api)} />);
  const view = within(await screen.findByRole('region', { name: 'Slideshow collections' }));
  const create = async (name: string) => {
    const field = view.getByRole('textbox', { name: 'New collection name' });
    await user.type(field, name);
    await user.click(view.getByRole('button', { name: 'Create collection' }));
    expect(field).toHaveValue('');
  };
  return { api, user, view, create };
}

describe('Break Slideshow collection management', () => {
  it('explains empty states, opens the image picker, and lets the operator select and rename a collection', async () => {
    const { api, create, view, user } = await setup();
    expect(view.getByText(/Create a collection to organize/)).toBeInTheDocument();
    await create('Sponsors');
    expect(view.getByText(/This collection is empty/)).toBeInTheDocument();
    expect(view.getByText(/Import images to build this collection/)).toBeInTheDocument();
    await user.click(view.getByRole('button', { name: 'Add images…' }));
    expect(api.importImages).toHaveBeenCalledOnce();

    await create('Events');
    const selected = view.getByRole('combobox', { name: 'Active collection' });
    expect(selected).toHaveDisplayValue('Sponsors');
    await user.selectOptions(selected, view.getByRole('option', { name: 'Events' }));
    const field = view.getByRole('textbox', { name: 'Collection name' });
    await user.clear(field);
    await user.type(field, 'Announcements');
    await user.click(view.getByRole('button', { name: 'Rename' }));
    expect(selected).toHaveDisplayValue('Announcements');
    await user.selectOptions(selected, '');
    expect(view.getByText(/Choose a collection to edit its slides/)).toBeInTheDocument();
  });

  it('adds, reorders and removes slides and updates the interval and image fit', async () => {
    const { api, view, create, user } = await setup([image(A, 'Logo.png'), image(B, 'Menu.png')]);
    await create('Sponsors');
    const add = async (id: string) => {
      await user.selectOptions(view.getByRole('combobox', { name: 'Library image' }), id);
      await user.click(view.getByRole('button', { name: 'Add slide' }));
    };
    await add(A);
    await add(B);
    const rows = () => view.getAllByRole('listitem');
    expect(rows()[0]).toHaveTextContent('Logo.png');
    expect(view.getByRole('button', { name: 'Move Logo.png up' })).toBeDisabled();
    await user.click(view.getByRole('button', { name: 'Move Menu.png up' }));
    expect(rows()[0]).toHaveTextContent('Menu.png');
    expect(rows()[1]).toHaveTextContent('Logo.png');
    await user.selectOptions(view.getByRole('combobox', { name: 'Collection image fit' }), 'fill');
    const override = view.getByRole('combobox', { name: 'Image fit for Menu.png' });
    expect(override).toHaveDisplayValue('Use collection fit');
    await user.selectOptions(override, 'fit');
    await user.selectOptions(override, '');
    await user.selectOptions(override, 'fit');
    const seconds = view.getByRole('spinbutton', { name: 'Seconds per slide' });
    await user.clear(seconds);
    await user.type(seconds, '20');
    await user.click(view.getByRole('button', { name: 'Set interval' }));
    await user.click(view.getByRole('button', { name: 'Remove Logo.png from collection' }));
    expect(rows()).toHaveLength(1);
    expect(api.current().slideshow.collections[0]).toMatchObject({
      secondsPerSlide: 20,
      fit: 'fill',
      slides: [{ mediaId: B, fit: 'fit' }],
    });
    expect(api.current().mediaLibrary).toHaveLength(2);
  });

  it('confirms collection deletion and keeps the imported images', async () => {
    const { api, view, create, user } = await setup([image(A, 'Logo.png')]);
    await create('Sponsors');
    const remove = view.getByRole('button', { name: 'Delete collection…' });
    await user.click(remove);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(api.current().slideshow.collections).toHaveLength(1);
    await user.click(remove);
    const dialog = within(screen.getByRole('dialog', { name: 'Delete “Sponsors”?' }));
    await user.click(dialog.getByRole('button', { name: 'Delete collection' }));
    expect(api.current().slideshow).toEqual({ collections: [], activeId: null });
    expect(api.current().mediaLibrary[0]?.id).toBe(A);
  });
});
