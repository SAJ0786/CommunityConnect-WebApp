import { useEffect, useState } from 'react';

function usePublicFeed(kind) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ [kind]: [], loading: true, error: false, fromCache: false });
  useEffect(() => {
    let active = true;
    let unsubscribe = () => {};
    setState({ [kind]: [], loading: true, error: false, fromCache: false });
    const fail = () => { if (active) setState({ [kind]: [], loading: false, error: true, fromCache: false }); };
    const module = kind === 'businesses' ? import('../services/publicBusinessService') : import('../services/publicPromotionService');
    module.then(service => {
      if (!active) return;
      const listen = kind === 'businesses' ? service.listenPublicBusinesses : service.listenPublicPromotions;
      unsubscribe = listen(result => { if (active) setState({ ...result, loading: false, error: false }); }, fail);
    }).catch(fail);
    return () => { active = false; unsubscribe(); };
  }, [kind, attempt]);
  return { ...state, onRetry: () => setAttempt(value => value + 1) };
}

export const usePublicBusinesses = () => usePublicFeed('businesses');
export const usePublicPromotions = () => usePublicFeed('promotions');

// Recheck eligibility across midnight even if Firestore has no document changes.
export function usePromotionDay() {
  const [day, setDay] = useState(() => new Date().toISOString().slice(0, 10));
  useEffect(() => {
    const refresh = () => setDay(new Date().toISOString().slice(0, 10));
    const timer = setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, []);
  return day;
}
