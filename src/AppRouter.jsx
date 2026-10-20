import React, { lazy, Suspense, useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, firebaseConfigured } from './firebase/firebase';
import { useCityCatalogueRefresh } from './services/cityCatalogue';
import { directoryBrowseRoute, publicBusinessRoute } from './utils/businessRoutes.mjs';

const App = lazy(() => import('./App.jsx'));
const PublicDirectory = lazy(() => import('./pages/PublicDirectory'));

function DirectoryEntry({ route }) {
  const [member, setMember] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => onAuthStateChanged(auth, user => setMember(!!user && !user.isAnonymous),
    problem => setError(problem.message || 'Unable to restore your account.')), []);
  if (error) return <div role="alert" className="directory-state">{error} <button onClick={() => window.location.reload()}>Try again</button></div>;
  if (member === null) return <p role="status" className="directory-state">Restoring your account…</p>;
  return member || !directoryBrowseRoute(window.location.pathname) ? <App /> : <PublicDirectory route={route} />;
}

// Shared business details remain public; browse links restore the real session
// before choosing the same workspace used by the in-app Directory tab.
export default function AppRouter() {
  useCityCatalogueRefresh();
  const [route] = useState(() => publicBusinessRoute(window.location.pathname));
  return <Suspense fallback={<p role="status" className="directory-state">Loading Community Connect…</p>}>
    {route ? ['directory', 'promotions'].includes(route.type) && firebaseConfigured
      ? <DirectoryEntry route={route} />
      : <PublicDirectory route={route} /> : <App />}
  </Suspense>;
}
