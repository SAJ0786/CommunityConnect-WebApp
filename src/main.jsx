import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles/theme.css';
import App from './App.jsx';
import { registerSW } from './services/swService.js';

createRoot(document.getElementById('root')).render(<App />);

// Register service worker for PWA + auto-updates
registerSW();
