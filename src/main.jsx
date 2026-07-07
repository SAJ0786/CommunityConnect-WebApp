import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles/theme.css';
import App from './App.jsx';
import { registerSW } from './services/swService.js';

// Recover once when an open app references a chunk replaced by a new release.
window.addEventListener('vite:preloadError', event => {
  event.preventDefault();
  const recoveryKey = 'community-events-chunk-recovery';
  if (sessionStorage.getItem(recoveryKey)) return;
  sessionStorage.setItem(recoveryKey, '1');
  window.location.reload();
});

window.setTimeout(() => sessionStorage.removeItem('community-events-chunk-recovery'), 10000);

createRoot(document.getElementById('root')).render(<App />);

// Register service worker for PWA + auto-updates
registerSW();
