import CitySelector from '../components/CitySelector';
import { CITY_OPTIONS, DEFAULT_CITY } from '../utils/cities';
import React, { useEffect, useRef, useState } from 'react';
import BackControl from '../components/BackControl';
import EventCard from '../components/EventCard';
import UserTransferPicker from '../components/UserTransferPicker';
import { useRegistration, useRegistrationFeed } from './RegistrationContext';
import { registrationReviewDetail } from './registrationViewModel.mjs';
import RegistrationReview from './RegistrationReview';

export default function RegistrationEventPanel({ scope, city, user, profile, users = [], onCalendar }) {
  const registration = useRegistration();
  const [selectedCity, setSelectedCity] = useState(city || profile?.defaultCity || DEFAULT_CITY);
  const { events, loading, error } = useRegistrationFeed(registration?.api, 'management', selectedCity, registration?.revision);
  const [expanded, setExpanded] = useState(null), [review, setReview] = useState(null);
  const [busy, setBusy] = useState(false), [problem, setProblem] = useState('');
  const [poster, setPoster] = useState(null);
  const [feedback, setFeedback] = useState('');
  const [transfer, setTransfer] = useState(null), [targetUid, setTargetUid] = useState('');
  const epoch = useRef(0);
  useEffect(() => { epoch.current++; setTransfer(null); setTargetUid(''); setReview(null); setPoster(null); setExpanded(null); setBusy(false); }, [selectedCity]);
  useEffect(() => {
    const hide = () => { if (document.hidden) { epoch.current++; setReview(null); setPoster(null); setExpanded(null); setTransfer(null); setTargetUid(''); setBusy(false); } };
    document.addEventListener('visibilitychange', hide);
    return () => { epoch.current++; document.removeEventListener('visibilitychange', hide); };
  }, []);
  useEffect(() => { epoch.current++; setReview(null); setPoster(null); setExpanded(null); setTransfer(null); setTargetUid(''); setSelectedCity(city || profile?.defaultCity || DEFAULT_CITY); }, [user?.uid, city, profile?.defaultCity, profile?.role]);
  if (!registration?.api) return null;
  const candidates = users.filter(row => row.id !== transfer?.ownerUid && row.isActive !== false && !row.migratedToUid && !row.bannedAt && !row.archivedAt && !row.accountDeletedAt && !['inactive','banned','deleted','archived','suspended'].includes(row.accountStatus));
  const confirmTransfer = async () => {
    const target=candidates.find(row=>row.id===targetUid);
    if (busy || !transfer || !target || !window.confirm(`Transfer this event to ${target.fullName || target.email || 'this member'}? The new organiser will be able to manage this event and its registration responses. Other series occurrences are unchanged.`)) return;
    const token=++epoch.current; setBusy(true); setProblem('');
    try { await registration.api.transfer(transfer.id,transfer.revision,targetUid); if(token===epoch.current){setTransfer(null);setTargetUid('');setExpanded(null);setReview(null);registration.refresh();} }
    catch(error){if(token===epoch.current)setProblem(error.message || 'Transfer failed.');}
    finally{if(token===epoch.current)setBusy(false);}
  };
  const deleteHidden = async event => {
    if (busy || !window.confirm('Delete this hidden event? Existing places will be released and registration history retained.')) return;
    const token=++epoch.current; setBusy(true); setProblem('');
    try { await registration.api.deleteEvent(event.id,event.revision); if(token===epoch.current) registration.refresh(); }
    catch(error) {if(token===epoch.current)setProblem(error.message);}
    finally {if(token===epoch.current)setBusy(false);}
  };
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
    {events.map(event => event.moderationOnly ? <section className="card" key={event.id} aria-label="Hidden event moderation"><h3>{event.title}</h3><p>Hidden by organiser · {event.date}</p><p>Only the organiser can open or restore this event.</p><button type="button" disabled={busy} onClick={() => deleteHidden(event)}>Delete event</button></section> : <div key={event.id} id={`event-${event.id}`}><EventCard event={event} user={user} profile={profile}
      isExpanded={expanded === event.id} onExpand={setExpanded} onCalendar={onCalendar} onApprove={prepareApproval}/>
      {event.canApprove && expanded !== event.id && <button disabled={busy} onClick={() => setExpanded(event.id)}>View event awaiting approval</button>}
      {event.canTransfer && <button type="button" className="btn-light" disabled={busy} onClick={()=>{setTransfer(event);setTargetUid('');setProblem('');}}>Transfer ownership</button>}
    </div>)}
    {transfer && <section className="card" aria-label="Transfer registration event ownership"><h3>Transfer {transfer.title}</h3><p>The new organiser receives access to this event and its registration responses. This transfers only this occurrence.</p><UserTransferPicker key={transfer.id} users={candidates} value={targetUid} disabled={busy} onChange={setTargetUid}/><div className="registration-actions"><button type="button" disabled={busy || !targetUid} onClick={confirmTransfer}>{busy?'Transferring…':'Confirm transfer'}</button><button type="button" className="btn-light" disabled={busy} onClick={()=>{setTransfer(null);setTargetUid('');}}>Cancel</button></div></section>}
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
