import React from 'react';
import { createRoot } from 'react-dom/client';
import AppRouter from '../../src/AppRouter';
import '../../src/styles/theme.css';
createRoot(document.getElementById('root')).render(<>
  <aside className="local-preview-notice">Offline public browsing preview · synthetic businesses and offers · no Firebase or sign-in</aside>
  <AppRouter />
</>);
