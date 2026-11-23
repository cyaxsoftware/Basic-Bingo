import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import type { MediaItem } from '../../../shared/media';
import { BrandMark } from './BrandMark';

const logo: MediaItem = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  name: 'Club logo.png',
  format: 'png',
  bytes: 100,
  width: 128,
  height: 128,
  addedAt: '',
  fit: 'fill',
};

it('falls back to the brand name if its local logo cannot load', () => {
  render(<BrandMark branding={{ name: 'Community Bingo Night', logoId: logo.id }} library={[logo]} />);
  const img = screen.getByTestId('branding').querySelector('img')!;
  expect(img).toHaveAttribute('src', `bingo-media://${logo.id}`);
  expect(img).toHaveAttribute('alt', '');
  fireEvent.error(img);
  expect(screen.getByTestId('branding')).toHaveTextContent('Community Bingo Night');
  expect(img).not.toBeInTheDocument();
});

it('names a standalone logo and removes its empty space if it cannot load', () => {
  render(<BrandMark branding={{ name: '', logoId: logo.id }} library={[logo]} />);
  fireEvent.error(screen.getByRole('img', { name: logo.name }));
  expect(screen.queryByTestId('branding')).toBeNull();
});
