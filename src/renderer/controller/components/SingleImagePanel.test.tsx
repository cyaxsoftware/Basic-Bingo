import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { MediaItem } from '../../../shared/media';
import { createSnapshotStore } from '../../shared/snapshotStore';
import { createFakeBingoApi, makeSnapshot } from '../../test/fakeBingoApi';
import { ControllerApp } from '../ControllerApp';

const ID_LOGO = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ID_MENU = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const image = (id: string, name: string, width = 1200, height = 600): MediaItem => ({
  id,
  name,
  format: 'png',
  bytes: 1000,
  width,
  height,
  addedAt: '2026-01-01T00:00:00.000Z',
});

const LOGO = image(ID_LOGO, 'Legion Sponsors.png');
const MENU = image(ID_MENU, 'Menu.jpg', 1920, 1080);

function renderPanel(overrides: Parameters<typeof makeSnapshot>[0] = {}) {
  const api = createFakeBingoApi(makeSnapshot({ presentationMode: 'singleImage', ...overrides }));
  render(<ControllerApp api={api} store={createSnapshotStore(api)} />);
  return api;
}

const panel = () => screen.findByRole('region', { name: 'Single image' });

describe('Single Image panel', () => {
  describe('with no images', () => {
    it('explains how to add some, and has nothing to remove', async () => {
      renderPanel();
      const view = await panel();
      expect(within(view).getByText(/There are no images yet/)).toBeInTheDocument();
      expect(within(view).getByText(/No image is showing/)).toBeInTheDocument();
      expect(within(view).getByRole('button', { name: 'Remove this image…' })).toBeDisabled();
      expect(within(view).getByRole('button', { name: 'Add images…' })).toBeEnabled();
    });

    it('asks the app to open the file dialog from Add images', async () => {
      const api = renderPanel();
      await userEvent.click(within(await panel()).getByRole('button', { name: 'Add images…' }));
      expect(api.importImages).toHaveBeenCalledTimes(1);
    });
  });

  describe('with images', () => {
    const withImages = { mediaLibrary: [LOGO, MENU], singleImage: { imageId: ID_LOGO, fit: 'fit' as const } };

    it('shows the chosen image in the preview, from the library, with its name and size', async () => {
      renderPanel(withImages);
      const view = await panel();
      const preview = within(view).getByRole('img', { name: 'Legion Sponsors.png' });
      expect(preview).toHaveAttribute('src', `bingo-media://${ID_LOGO}`);
      expect(view).toHaveTextContent('Legion Sponsors.png · 1200 × 600');
      expect(view).toHaveTextContent('Image library · 2 images');
    });

    it('lists every image as a button, marking the one on the projector', async () => {
      renderPanel(withImages);
      const view = await panel();
      const logo = within(view).getByRole('button', { name: 'Legion Sponsors.png, 1200 × 600' });
      const menu = within(view).getByRole('button', { name: 'Menu.jpg, 1920 × 1080' });
      expect(logo).toHaveAttribute('aria-pressed', 'true');
      expect(logo).toHaveTextContent('On projector');
      expect(menu).toHaveAttribute('aria-pressed', 'false');
      expect(menu).not.toHaveTextContent('On projector');
    });

    it('tapping an image puts it on the projector', async () => {
      const api = renderPanel(withImages);
      const view = await panel();
      await userEvent.click(within(view).getByRole('button', { name: 'Menu.jpg, 1920 × 1080' }));
      expect(api.selectSingleImage).toHaveBeenCalledExactlyOnceWith(ID_MENU);
      expect(api.current().singleImage.imageId).toBe(ID_MENU);
      expect(within(view).getByRole('img', { name: 'Menu.jpg' })).toHaveAttribute(
        'src',
        `bingo-media://${ID_MENU}`,
      );
      expect(within(view).getByRole('button', { name: 'Menu.jpg, 1920 × 1080' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });

    it('switches between Fit and Fill, explaining each', async () => {
      const api = renderPanel(withImages);
      const view = await panel();
      const fit = within(view).getByRole('button', { name: 'Fit' });
      const fill = within(view).getByRole('button', { name: 'Fill' });
      expect(fit).toHaveAttribute('aria-pressed', 'true');
      expect(fill).toHaveAttribute('aria-pressed', 'false');
      expect(view).toHaveTextContent(/Fit shows the whole image/);

      await userEvent.click(fill);
      expect(api.setSingleImageFit).toHaveBeenCalledExactlyOnceWith('fill');
      expect(api.current().singleImage.fit).toBe('fill');
      expect(fill).toHaveAttribute('aria-pressed', 'true');
      expect(fit).toHaveAttribute('aria-pressed', 'false');
      expect(view).toHaveTextContent(/Fill covers the whole screen/);
    });

    describe('Remove this image…', () => {
      it('asks first, naming the image, and Cancel changes nothing', async () => {
        const api = renderPanel(withImages);
        const view = await panel();
        await userEvent.click(within(view).getByRole('button', { name: 'Remove this image…' }));
        const dialog = screen.getByRole('dialog', { name: /Remove “Legion Sponsors.png”\?/ });
        expect(dialog).toHaveTextContent(/cannot be undone/);
        await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(api.removeImage).not.toHaveBeenCalled();
        expect(api.current().mediaLibrary).toHaveLength(2);
      });

      it('Confirm removes it; nothing is then showing, and the other image stays', async () => {
        const api = renderPanel(withImages);
        const view = await panel();
        await userEvent.click(within(view).getByRole('button', { name: 'Remove this image…' }));
        await userEvent.click(
          within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove Image' }),
        );
        expect(api.removeImage).toHaveBeenCalledExactlyOnceWith(ID_LOGO);
        expect(api.current().mediaLibrary.map((item) => item.id)).toEqual([ID_MENU]);
        expect(api.current().singleImage.imageId).toBeNull();
        expect(within(view).getByText(/No image is showing/)).toBeInTheDocument();
        expect(within(view).getByRole('button', { name: 'Menu.jpg, 1920 × 1080' })).toBeInTheDocument();
        expect(within(view).getByRole('button', { name: 'Remove this image…' })).toBeDisabled();
      });
    });

    describe('an image whose file will not load', () => {
      it('shows a plain message in the preview, never a broken picture', async () => {
        renderPanel(withImages);
        const view = await panel();
        fireEvent.error(within(view).getByRole('img', { name: 'Legion Sponsors.png' }));
        expect(within(view).queryByRole('img', { name: 'Legion Sponsors.png' })).toBeNull();
        expect(within(view).getByText(/This image cannot be shown/)).toBeInTheDocument();
        // It can still be removed, which is how a lost image is cleaned up.
        expect(within(view).getByRole('button', { name: 'Remove this image…' })).toBeEnabled();
      });

      it('marks its thumbnail as missing', async () => {
        renderPanel(withImages);
        const view = await panel();
        const thumb = within(view).getByRole('button', { name: 'Menu.jpg, 1920 × 1080' });
        fireEvent.error(thumb.querySelector('img') as HTMLImageElement);
        expect(thumb).toHaveTextContent('Missing');
        expect(thumb.querySelector('img')).toBeNull();
      });
    });
  });

  it('follows the app: an image chosen or added elsewhere appears', async () => {
    const api = renderPanel({ mediaLibrary: [LOGO], singleImage: { imageId: null, fit: 'fit' } });
    const view = await panel();
    expect(within(view).getByText(/No image is showing/)).toBeInTheDocument();
    api.push(
      makeSnapshot({
        revision: 5,
        presentationMode: 'singleImage',
        mediaLibrary: [LOGO, MENU],
        singleImage: { imageId: ID_MENU, fit: 'fill' },
      }),
    );
    expect(await within(view).findByRole('img', { name: 'Menu.jpg' })).toBeInTheDocument();
    expect(within(view).getByRole('button', { name: 'Fill' })).toHaveAttribute('aria-pressed', 'true');
  });
});
