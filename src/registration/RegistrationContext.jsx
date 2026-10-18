import { createContext, useContext, useEffect, useState } from 'react';
import { registrationEventPages } from './eventFeed.mjs';

export const RegistrationContext = createContext(null);
export const useRegistration = () => useContext(RegistrationContext);

export function useRegistrationFeed(api, scope, city, revision = 0) {
  const [state, setState] = useState({ events: [], loading: false, error: '' });
  const key = [scope, city || '', revision].join(':');
  useEffect(() => {
    if (!api) { setState({ events: [], loading: false, error: '' }); return; }
    let current = true;
    setState(previous => ({ api, key, events: previous.api === api && previous.key === key ? previous.events : [], loading: true, error: '' }));
    registrationEventPages(api, { scope, ...(city ? { city } : {}) }, events => { if (current) setState({ api, key, events, loading: true, error: '' }); })
      .then(events => { if (current) setState({ api, key, events, loading: false, error: '' }); })
      .catch(error => { if (current) setState({ api, key, events: [], loading: false, error: error.message || 'Registration events could not be loaded.' }); });
    return () => { current = false; };
  }, [api, scope, city, revision]);
  return state.api === api && state.key === key ? state : { events: [], loading: Boolean(api), error: '' };
}
