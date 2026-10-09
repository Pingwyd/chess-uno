import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Self-hosted (OFL) so the app looks right offline: Anton for display, Inter for everything else.
import '@fontsource/anton/latin-400.css';
import '@fontsource-variable/inter/wght.css';
import './ui/styles.css';
import { App } from './ui/App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
