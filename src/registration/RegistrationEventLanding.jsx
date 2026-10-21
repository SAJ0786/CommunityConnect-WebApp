import React, { useEffect, useState } from 'react';
import BackControl from '../components/BackControl';
import EventCard from '../components/EventCard';
import { useRegistration } from './RegistrationContext';
import { registrationEventCard } from './eventFeed.mjs';
import './workspace.css';

// Notification/email shortcuts show the same event card as discovery and My Events.
// Forms and responses remain deliberate actions available from that card.
export default function RegistrationEventLanding({ api, enabled, eventId, user, profile, onBack, ...cardProps }) {
  const registration = useRegistration();
  const revision = registration?.revision;
  const [state, setState] = useState(null), [attempt, setAttempt] = useState(0);
  const [visible, setVisible] = useState(() => !document.hidden);
  const [expanded, setExpanded] = useState(true);
  const key = [user?.uid, eventId, revision].join(':');
  useEffect(() => {
    const changed = () => { setState(null); setVisible(!document.hidden); };
    document.addEventListener('visibilitychange', changed);
    return () => document.removeEventListener('visibilitychange', changed);
  }, []);
  useEffect(() => {
    if (!enabled || !api || !eventId || !visible) return;
    let current = true;
    setState(null); setExpanded(true);
    (api.card || api.load)(eventId)
      .then(detail => { if (current) setState({api,key,detail}); })
      .catch(error => { if (current) setState({api,key,error:error.message || 'This event could not be opened.'}); });
    return () => { current = false; };
  }, [api, enabled, eventId, key, visible, attempt]);
  const current = visible && state?.api === api && state?.key === key ? state : null;
  const detail = current?.detail;
  const event = detail && registrationEventCard({...detail.event, canManage:detail.canManage,
    canApprove:detail.canApprove, isRegistered:detail.ownRegistration?.status === 'registered',
    hasPoster:Boolean(detail.privateDetails?.hasPoster)});
  return <main className="registration-event-landing" aria-label="Registration event">
    <BackControl onClick={onBack} label="Back to Events"/>
    {!enabled ? <p>Registration is not enabled for this release.</p> : !visible ? <p role="status">Event details are hidden while the app is inactive.</p>
      : current?.error ? <section className="card" role="alert"><p>{current.error}</p><button type="button" onClick={() => setAttempt(value => value + 1)}>Retry event</button></section>
      : event ? <EventCard {...cardProps} key={key + ':' + event.revision} event={event} user={user} profile={profile}
        isExpanded={expanded} onExpand={id => setExpanded(Boolean(id))}
        registrationCardDetail={{uid:user?.uid,revision,detail}}/>
      : <p role="status">Loading event…</p>}
  </main>;
}
