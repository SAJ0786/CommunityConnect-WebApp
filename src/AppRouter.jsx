import React, { lazy, Suspense } from 'react';
import { useCityCatalogueRefresh } from './services/cityCatalogue';
import { publicBusinessRoute } from './utils/businessRoutes.mjs';

const App = lazy(() => import('./App.jsx'));
const PublicDirectory = lazy(() => import('./pages/PublicDirectory'));

// Only the new public namespace is handled here. Existing Events and entry flows
// stay with App, and public links never mount its account/sign-in orchestration.
export default function AppRouter() {
  useCityCatalogueRefresh();
  const route = publicBusinessRoute(window.location.pathname);
  return <Suspense fallback={<p role="status" className="directory-state">Loading Community Connect…</p>}>
    {route ? <PublicDirectory route={route} /> : <App />}
  </Suspense>;
}
