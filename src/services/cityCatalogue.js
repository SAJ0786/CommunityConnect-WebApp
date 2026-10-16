import { useEffect, useSyncExternalStore } from 'react';
import { doc, getDocFromServer } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../firebase/firebase';
import { CITY_CATALOGUE_ENABLED } from '../config/releaseGates.mjs';
import { cityCatalogueRevision, subscribeCityCatalogue, installCityCatalogue, validateCityCatalogue } from '../utils/cities';
const KEY = 'community-connect/city-catalogue/v1';
let pending, lastCheck = 0, cacheLoaded = false;
export function acceptCityCatalogue(data) {
  const valid = validateCityCatalogue(data);
  if (!valid || !installCityCatalogue(valid)) return false;
  try { localStorage.setItem(KEY, JSON.stringify(valid)); } catch { /* memory remains valid */ }
  return true;
}
export function refreshCityCatalogue() {
  if (!CITY_CATALOGUE_ENABLED) return Promise.resolve();
  if (pending) return pending;
  pending = (async () => {
    if (!cacheLoaded) {
      cacheLoaded = true;
      try { const cached = localStorage.getItem(KEY); if (cached) installCityCatalogue(JSON.parse(cached)); } catch { /* bundled fallback */ }
    }
    if (lastCheck && Date.now() - lastCheck < 3600000) return;
    let timer;
    try {
      const snapshot = await Promise.race([getDocFromServer(doc(db, 'settings', 'cityCatalogue')),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Catalogue timeout')), 8000); })]);
      if (snapshot.exists() && acceptCityCatalogue(snapshot.data())) lastCheck = Date.now();
    } catch { /* retain last-known-good catalogue; retry on foreground */ }
    finally { clearTimeout(timer); }
  })().finally(() => { pending = null; });
  return pending;
}
export function useCityCatalogue() {
  return useSyncExternalStore(subscribeCityCatalogue, cityCatalogueRevision, cityCatalogueRevision);
}
export function useCityCatalogueRefresh() {
  const revision = useCityCatalogue();
  useEffect(() => {
    void refreshCityCatalogue();
    const refresh = () => { if (!document.hidden) void refreshCityCatalogue(); };
    const retry = setInterval(() => { if (!document.hidden) void refreshCityCatalogue(); }, 30000);
    const stopAuth = onAuthStateChanged(auth, user => { if (user) void refreshCityCatalogue(); });
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('online', refresh);
    return () => { clearInterval(retry); stopAuth(); document.removeEventListener('visibilitychange', refresh); window.removeEventListener('online', refresh); };
  }, []);
  return revision;
}
