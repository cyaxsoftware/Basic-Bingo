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
  fit: 'fit' as const,
});

const LOGO = image(ID_LOGO, 'Legion Sponsors.png');
const MENU = image(ID_MENU, 'Menu.jpg', 1920, 1080);

function renderPanel(overrides: Parameters<typeof makeSnapshot>[0] = {}) {
  const api = createFakeBingoApi(makeSnapshot({ presentationMode: 'singleImage', ...overrides }));
  render(<ControllerApp api={api} store={createSnapshotStore(api)} />);
  return api;
}

const panel = () => screen.findByRole('region', { name: 'Single image' });

it('sets and clears branding from the image library and returns focus to its opener', async () => {
  const api = renderPanel({ mediaLibrary: [LOGO, MENU] });
  const user = userEvent.setup();
  const opener = within(await panel()).getByRole('button', { name: 'Branding…' });
  const brand = () => within(screen.getByRole('banner')).queryByTestId('branding');
  expect(brand()).toBeNull();
  await user.click(opener);
  const dialog = await screen.findByRole('dialog', { name: 'Branding' });
  const form = within(dialog);
  await user.type(form.getByRole('textbox', { name: 'Organization or event name' }), 'Community Bingo Night');
  await user.selectOptions(form.getByRole('combobox', { name: 'Logo' }), ID_LOGO);
  await user.click(form.getByRole('button', { name: 'Apply branding' }));
  expect(api.setBranding).toHaveBeenCalledWith({ name: 'Community Bingo Night', logoId: ID_LOGO });
  expect(brand()).toHaveTextContent('Community Bingo Night');
  expect(brand()?.querySelector('img')).toHaveAttribute('src', `bingo-media://${ID_LOGO}`);
  expect(opener).toHaveFocus();

  await user.click(opener);
  await user.click(screen.getByRole('button', { name: 'Clear branding' }));
  expect(brand()).toBeNull();
  expect(api.setBranding).toHaveBeenLastCalledWith(null);
  expect(api.current().mediaLibrary).toEqual([LOGO, MENU]);
  expect(opener).toHaveFocus();
});

describe('Single Image panel', () => {
  describe('with no images', () => {
    it('explains how to add some, and has nothing to remove', async () => {
      renderPanel();
      const view = await panel();
      expect(within(view).getByText(/There are no images yet/)).toBeInTheDocument();
      expect(within(view).getByText(/No image is showing/)).toBeInTheDocument();
      expect(within(view).getByRole('button', { name: 'Remove this image…' })).toBeDisabled();
      expect(within(view).getByRole('button', { name: 'Add images…' })).toBeEnabled();
      // Fit, Fill and Original are about the chosen image, so they wait for one.
      for (const name of ['Fit', 'Fill', 'Original']) {
        expect(within(view).getByRole('button', { name })).toBeDisabled();
      }
      expect(view).toHaveTextContent(/Choose an image to set how it fits the screen/);
    });

    it('asks the app to open the file dialog from Add images', async () => {
      const api = renderPanel();
      await userEvent.click(within(await panel()).getByRole('button', { name: 'Add images…' }));
      expect(api.importImages).toHaveBeenCalledTimes(1);
    });
  });

  describe('with images', () => {
    const withImages = { mediaLibrary: [LOGO, MENU], singleImage: { imageId: ID_LOGO } };

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
      const logo = within(view).getByRole('button', {
        name: 'Legion Sponsors.png, 1200 × 600, On projector',
      });
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
      expect(
        within(view).getByRole('button', { name: 'Menu.jpg, 1920 × 1080, On projector' }),
      ).toHaveAttribute('aria-pressed', 'true');
    });

    const previewOf = (view: HTMLElement, name: string) => {
      const picture = within(view).getByRole('img', { name });
      return { picture, box: picture.parentElement as HTMLElement };
    };

    it('sets how the chosen image fits: Fit, Fill or Original, each explained', async () => {
      const api = renderPanel(withImages);
      const view = await panel();
      const fit = within(view).getByRole('button', { name: 'Fit' });
      const fill = within(view).getByRole('button', { name: 'Fill' });
      const original = within(view).getByRole('button', { name: 'Original' });
      expect(fit).toHaveAttribute('aria-pressed', 'true');
      expect(fill).toHaveAttribute('aria-pressed', 'false');
      expect(original).toHaveAttribute('aria-pressed', 'false');
      expect(view).toHaveTextContent(/Fit shows the whole image/);

      await userEvent.click(fill);
      expect(api.setImageFit).toHaveBeenCalledExactlyOnceWith(ID_LOGO, 'fill');
      expect(api.current().mediaLibrary.find((item) => item.id === ID_LOGO)?.fit).toBe('fill');
      expect(fill).toHaveAttribute('aria-pressed', 'true');
      expect(fit).toHaveAttribute('aria-pressed', 'false');
      expect(view).toHaveTextContent(/Fill covers the whole screen/);
      expect(previewOf(view, 'Legion Sponsors.png').box).toHaveAttribute('data-fit', 'fill');

      await userEvent.click(original);
      expect(api.current().mediaLibrary.find((item) => item.id === ID_LOGO)?.fit).toBe('original');
      expect(original).toHaveAttribute('aria-pressed', 'true');
      expect(view).toHaveTextContent(/Original shows the image at its own size, centered/);
      const { picture, box } = previewOf(view, 'Legion Sponsors.png');
      expect(box).toHaveAttribute('data-fit', 'original');
      // 1200 px wide against the 1920 px reference screen: 62.5% of the preview.
      expect(picture).toHaveStyle({ width: '62.5%' });
    });

    it('each image remembers its own setting: choosing another image shows that one', async () => {
      renderPanel({
        mediaLibrary: [
          { ...LOGO, fit: 'fill' },
          { ...MENU, fit: 'original' },
        ],
        singleImage: { imageId: ID_LOGO },
      });
      const view = await panel();
      expect(within(view).getByRole('button', { name: 'Fill' })).toHaveAttribute('aria-pressed', 'true');

      await userEvent.click(within(view).getByRole('button', { name: 'Menu.jpg, 1920 × 1080, Original' }));
      expect(within(view).getByRole('button', { name: 'Original' })).toHaveAttribute('aria-pressed', 'true');
      expect(within(view).getByRole('button', { name: 'Fill' })).toHaveAttribute('aria-pressed', 'false');

      await userEvent.click(
        within(view).getByRole('button', { name: 'Legion Sponsors.png, 1200 × 600, Fill' }),
      );
      expect(within(view).getByRole('button', { name: 'Fill' })).toHaveAttribute('aria-pressed', 'true');
    });

    it('marks the images that are not Fit in the library, so they can be told apart', async () => {
      renderPanel({
        mediaLibrary: [
          { ...LOGO, fit: 'fill' },
          { ...MENU, fit: 'original' },
          image('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Plain.png'),
        ],
        singleImage: { imageId: ID_LOGO },
      });
      const view = await panel();
      expect(
        within(view).getByRole('button', { name: 'Legion Sponsors.png, 1200 × 600, Fill On projector' }),
      ).toHaveTextContent('Fill');
      expect(within(view).getByRole('button', { name: 'Menu.jpg, 1920 × 1080, Original' })).toHaveTextContent(
        'Original',
      );
      const plain = within(view).getByRole('button', { name: 'Plain.png, 1200 × 600' });
      expect(plain).not.toHaveTextContent('Fill');
      expect(plain).not.toHaveTextContent('Original');
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
        expect(thumb).toHaveAccessibleName('Menu.jpg, 1920 × 1080, Missing');
        expect(thumb.querySelector('img')).toBeNull();
      });
    });
  });

  it('follows the app: an image chosen or added elsewhere appears', async () => {
    const api = renderPanel({ mediaLibrary: [LOGO], singleImage: { imageId: null } });
    const view = await panel();
    expect(within(view).getByText(/No image is showing/)).toBeInTheDocument();
    api.push(
      makeSnapshot({
        revision: 5,
        presentationMode: 'singleImage',
        mediaLibrary: [LOGO, { ...MENU, fit: 'fill' }],
        singleImage: { imageId: ID_MENU },
      }),
    );
    expect(await within(view).findByRole('img', { name: 'Menu.jpg' })).toBeInTheDocument();
    expect(within(view).getByRole('button', { name: 'Fill' })).toHaveAttribute('aria-pressed', 'true');
  });
});
