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
}

const project = () => screen.queryByRole('button', { name: 'Project' });
const stop = () => screen.queryByRole('button', { name: 'Stop' });

describe('PresentationControls Project / Stop toggle', () => {
  it('shows Project (and no Stop) while nothing is open', () => {
    renderControls({ kind: 'closed' });
    expect(project()).toBeEnabled();
    expect(stop()).not.toBeInTheDocument();
  });

  it('swaps Project for a red Stop while projecting', () => {
    renderControls({ kind: 'projecting', displayId: PROJECTOR.id, displayLabel: PROJECTOR.label });
    expect(project()).not.toBeInTheDocument();
    expect(stop()).toBeEnabled();
    expect(stop()).toHaveAttribute('data-live', 'true');
  });

  it('keeps Project and adds a plain Stop for the Preview window', () => {
    renderControls({ kind: 'preview' });
    expect(project()).toBeEnabled();
    expect(stop()).toBeEnabled();
    expect(stop()).not.toHaveAttribute('data-live');
  });

  it('can still be stopped while the window is opening', () => {
    renderControls({ kind: 'opening' });
    expect(stop()).toBeEnabled();
  });

  it('still shows Stop while projecting if the display list has gone empty', () => {
    render(
      <PresentationControls
        displays={[LAPTOP]}
        presentation={{ kind: 'projecting', displayId: PROJECTOR.id, displayLabel: PROJECTOR.label }}
        preferredDisplayId={null}
        onProject={() => {}}
        onPreview={() => {}}
        onStop={() => {}}
      />,
    );
    expect(stop()).toBeEnabled();
  });
});
