import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../shared/styles/tokens.css';
import './presentation.css';
import { getPresentationApi } from '../shared/bingoApi';
import { createSnapshotStore } from '../shared/snapshotStore';
import { PresentationApp } from './PresentationApp';

const store = createSnapshotStore(getPresentationApi());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PresentationApp store={store} />
  </StrictMode>,
);
