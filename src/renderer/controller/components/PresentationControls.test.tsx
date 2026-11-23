import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { PresentationStatus } from '../../../shared/ipc/contract';
import { LAPTOP, PROJECTOR } from '../../test/fakeBingoApi';
import { PresentationControls } from './PresentationControls';

function renderControls(presentation: PresentationStatus) {
  render(
    <PresentationControls
      displays={[LAPTOP, PROJECTOR]}
      presentation={presentation}
      preferredDisplayId={null}
      onProject={() => {}}
      onPreview={() => {}}
      onStop={() => {}}
    />,
  );
  return screen.getByRole('button', { name: 'Stop' });
}

describe('PresentationControls Stop button', () => {
  it('is red (live) only while projecting', () => {
    const stop = renderControls({
      kind: 'projecting',
      displayId: PROJECTOR.id,
      displayLabel: PROJECTOR.label,
    });
    expect(stop).toBeEnabled();
    expect(stop).toHaveAttribute('data-live', 'true');
  });

  it('is neutral and disabled when nothing is open', () => {
    const stop = renderControls({ kind: 'closed' });
    expect(stop).toBeDisabled();
    expect(stop).toHaveAttribute('data-live', 'false');
  });

  it('stays neutral for the Preview window', () => {
    const stop = renderControls({ kind: 'preview' });
    expect(stop).toBeEnabled();
    expect(stop).toHaveAttribute('data-live', 'false');
  });
});
