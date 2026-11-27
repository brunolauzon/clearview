import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-700.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { applyLook, loadCachedLook } from './lib/theme';
import './theme.css';

// paint in the last look seen on this browser (or the default) before the server answers
applyLook(loadCachedLook() ?? { theme: null, background: null, accent: null });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
