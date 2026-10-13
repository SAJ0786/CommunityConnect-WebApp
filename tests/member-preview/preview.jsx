import React from 'react';
import { createRoot } from 'react-dom/client';
import App from '../../src/App';
import '../../src/styles/theme.css';
createRoot(document.getElementById('root')).render(<><p className="local-preview-notice">Offline registration test · synthetic account · no Firebase connection</p><App /></>);
