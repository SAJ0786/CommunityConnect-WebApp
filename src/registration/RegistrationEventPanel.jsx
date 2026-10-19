import CitySelector from '../components/CitySelector';
import { CITY_OPTIONS, DEFAULT_CITY } from '../utils/cities';
import React, { useEffect, useRef, useState } from 'react';
import BackControl from '../components/BackControl';
import EventCard from '../components/EventCard';
import { useRegistration, useRegistrationFeed } from './RegistrationContext';
import { registrationReviewDetail } from './registrationViewModel.mjs';
import RegistrationReview from './RegistrationReview';

export default function RegistrationEventPanel({ scope, city, user, profile, onCalendar }) {
  const registration = useRegistration();
  const [selectedCity, setSelectedCity] = useState(city || profile?.defaultCity || DEFAULT_CITY);
  const { events, loading, error } = useRegistrationFeed(registration?.api, 'management', selectedCity, registration?.revision);
  const [expanded, setExpanded] = useState(null), [review, setReview] = useState(null);
  const [busy, setBusy] = useState(false), [problem, setProblem] = useState('');
  const [poster, setPoster] = useState(null);
  const [feedback, setFeedback] = useState('');
  const epoch = useRef(0);
  useEffect(() => {
    const hide = () => { if (document.hidden) { epoch.current++; setReview(null); setPoster(null); setExpanded(null); setBusy(false); } };
    document.addEventListener('visibilitychange', hide);
    return () => { epoch.current++; document.removeEventListener('visibilitychange', hide); };
  }, []);
  useEffect(() => { epoch.current++; setReview(null); setPoster(null); setExpanded(null); setSelectedCity(city || profile?.defaultCity || DEFAULT_CITY); }, [user?.uid, city, profile?.defaultCity, profile?.role]);
  if (!registration?.api) return null;
  const prepareApproval = async event => {
    const token = ++epoch.current;
    setBusy(true); setProblem(''); setReview(null); setPoster(null);
    try {
      const fresh = await registration.api.load(event.id);
      if (token !== epoch.current) return;
      if (!fresh.canApprove || !(fresh.event.status === 'pending' || fresh.event.hasPendingChanges)) throw new Error('This event is no longer awaiting your approval. Refresh events.');
      setFeedback(''); setReview(registrationReviewDetail(fresh)); setExpanded(event.id);
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
  const decide = async decision => {
    if (!feedback.trim()) { setProblem('Enter feedback for the organiser.'); return; }
    const token = ++epoch.current;
    setBusy(true); setProblem('');
    try { await registration.api.review(review.event.id, review.event.revision, decision, feedback.trim()); if (token === epoch.current) { setReview(null); registration.refresh(); } }
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
  return <section className="registration-management" aria-label="Registration event management">
    <CitySelector value={selectedCity} onChange={setSelectedCity} label="Registration event city" options={profile?.role === 'superAdmin' ? CITY_OPTIONS : CITY_OPTIONS.filter(option => option.value === (city || profile?.adminCity || profile?.defaultCity))} />
    <h2>Registration only events</h2>
    <button disabled={loading || busy} onClick={() => registration.refresh()}>Refresh events</button>
    {loading && <p role="status">Loading registration events...</p>}
    {(error || problem) && <p role="alert">{error || problem}</p>}
    {!loading && !error && !events.length && <p>No registration events in this city.</p>}
    {events.map(event => <div key={event.id} id={`event-${event.id}`}><EventCard event={event} user={user} profile={profile}
      isExpanded={expanded === event.id} onExpand={setExpanded} onCalendar={onCalendar} onApprove={prepareApproval}/>
      {event.canApprove && expanded !== event.id && <button disabled={busy} onClick={() => setExpanded(event.id)}>View event awaiting approval</button>}
    </div>)}
    {review && <section aria-label="Review event approval">
      <BackControl disabled={busy} onClick={() => setReview(null)} label="Back to registration events"/>
      <h3>Review event</h3>
      <RegistrationReview detail={review} poster={poster} busy={busy} onPoster={loadPoster}/>
      <p>Review these event details, private poster and registration form before publishing.</p>
      <button disabled={busy || !review.form || !review.privateDetails || (review.privateDetails.hasPoster && !poster)} onClick={approve}>Approve event</button>
      <label>Feedback for organiser<textarea maxLength={2000} value={feedback} onChange={event => setFeedback(event.target.value)} disabled={busy}/></label>
      <div className="registration-actions"><button disabled={busy || !feedback.trim()} onClick={() => decide('rejected')}>Reject event</button><button disabled={busy || !feedback.trim()} onClick={() => decide('changes-requested')}>Suggest changes</button></div>
    </section>}
  </section>;
}
