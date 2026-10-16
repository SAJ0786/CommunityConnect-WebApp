import React, { useEffect, useRef, useState } from 'react';
import EventCard from '../components/EventCard';
import { useRegistration, useRegistrationFeed } from './RegistrationContext';
import { registrationReviewDetail } from './registrationViewModel.mjs';
import RegistrationReview from './RegistrationReview';

export default function RegistrationEventPanel({ scope, city, user, profile, onCalendar }) {
  const registration = useRegistration();
  const { events, loading, error } = useRegistrationFeed(registration?.api, scope, city, registration?.revision);
  const [expanded, setExpanded] = useState(null), [review, setReview] = useState(null);
  const [busy, setBusy] = useState(false), [problem, setProblem] = useState('');
  const [poster, setPoster] = useState(null);
  const epoch = useRef(0);
  useEffect(() => {
    const hide = () => { if (document.hidden) { epoch.current++; setReview(null); setPoster(null); setExpanded(null); setBusy(false); } };
    document.addEventListener('visibilitychange', hide);
    return () => { epoch.current++; document.removeEventListener('visibilitychange', hide); };
  }, []);
  if (!registration?.api) return null;
  const prepareApproval = async event => {
    const token = ++epoch.current;
    setBusy(true); setProblem(''); setReview(null); setPoster(null);
    try {
      const fresh = await registration.api.load(event.id);
      if (token !== epoch.current) return;
      if (!fresh.canApprove || !(fresh.event.status === 'pending' || fresh.event.hasPendingChanges)) throw new Error('This event is no longer awaiting your approval. Refresh events.');
      setReview(registrationReviewDetail(fresh)); setExpanded(event.id);
    } catch (error) { if (token === epoch.current) setProblem(error.message); }
    finally { if (token === epoch.current) setBusy(false); }
  };
  const approve = async () => {
    const token = ++epoch.current;
    setBusy(true); setProblem('');
    try { await registration.api.approve(review.event.id, review.event.revision); if (token === epoch.current) { setReview(null); registration.refresh(); } }
    catch (error) { if (token === epoch.current) { setProblem(error.message); setReview(null); } }
    finally { if (token === epoch.current) setBusy(false); }
  };
  const loadPoster = async () => {
    const token = ++epoch.current;
    setBusy(true); setProblem('');
    try {
      const result = await registration.api.poster(review.event.id, review.pendingChanges ? 'pending' : undefined);
      if (!['image/jpeg','image/png','image/webp'].includes(result.mime)) throw new Error('Unsupported event poster format.');
      if (token === epoch.current) setPoster(`data:${result.mime};base64,${result.base64}`);
    } catch (error) { if (token === epoch.current) setProblem(error.message); }
    finally { if (token === epoch.current) setBusy(false); }
  };
  return <section className="card" aria-label={scope === 'review' ? 'Pending event approvals' : 'Registration event management'}>
    <h3>{scope === 'review' ? 'Pending event approvals' : 'Registration event management'}</h3>
    {scope === 'review' && <p>All locations, including former cities. Only Superadmin can approve publication.</p>}
    <button disabled={loading || busy} onClick={() => registration.refresh()}>Refresh events</button>
    {loading && <p role="status">Loading registration events...</p>}
    {(error || problem) && <p role="alert">{error || problem}</p>}
    {!loading && !error && !events.length && <p>No events awaiting {scope === 'review' ? 'approval' : 'management'}.</p>}
    {events.map(event => <div key={event.id} id={`event-${event.id}`}><EventCard event={event} user={user} profile={profile}
      isExpanded={expanded === event.id} onExpand={setExpanded} onCalendar={onCalendar} onApprove={prepareApproval}/>
      {scope === 'review' && event.canApprove && <button disabled={busy} onClick={() => prepareApproval(event)}>Review for approval</button>}
    </div>)}
    {review && <section aria-label="Review event approval">
      <h4>Approve {review.event.title}?</h4>
      <RegistrationReview detail={review} poster={poster} busy={busy} onPoster={loadPoster}/>
      <p>Review these event details, private poster and registration form before publishing.</p>
      <button disabled={busy} onClick={() => setReview(null)}>Go back</button>
      <button disabled={busy} onClick={approve}>Approve event</button>
    </section>}
  </section>;
}
