import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../shared/styles/tokens.css';
import './controller.css';
import { getControllerApi } from '../shared/bingoApi';
import { createSnapshotStore } from '../shared/snapshotStore';
import { ControllerApp } from './ControllerApp';

const api = getControllerApi();
const store = createSnapshotStore(api);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ControllerApp api={api} store={store} />
  </StrictMode>,
);
