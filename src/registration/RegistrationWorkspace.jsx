import BackControl from '../components/BackControl';
import React, { useEffect, useRef, useState } from 'react';
import { EVENT_TYPES } from '../utils/constants';
import { cityLabel } from '../utils/cities';
import { createDraft, validateAnswers } from './prototypeModel.mjs';
import { createSubmission } from './registrationClient.mjs';
import { eventDraftFromDetail, answersForReview, mergeRegistrationPage, registrantName, registrationReviewDetail } from './registrationViewModel.mjs';
import { privateVenueLinks } from './privateVenue.mjs';
import { registrationEntryAllowed, registrationEventEnded } from './registrationStatus.mjs';
import RegistrationEditor from './RegistrationEditor';
import RegistrationFields from './RegistrationFields';
import RegistrationReview from './RegistrationReview';
import PagePanel from '../components/PagePanel';
import RegistrationSummary from './RegistrationSummary';
import OccurrencePicker from './OccurrencePicker';
import SeriesApproval from './SeriesApproval';
import { occurrenceSubmission } from './occurrenceSelection.mjs';
import './workspace.css';

const reference = () => crypto.randomUUID();
const answerText = value => Array.isArray(value) ? value.join(', ') : value === true ? 'Agreed' : String(value ?? '');
// api is injected: no direct Firestore reads, persistence, capacity or permission authority here.
export default function RegistrationWorkspace({ api, enabled = false, user, profile, city, onBack, onSubmitted, onRequireSignIn, initialCreate = false, initialEventId, initialAction = 'register', operationsOnly = false, eventTypes = EVENT_TYPES }) {
  const [stage, setStage] = useState('list'), [scope, setScope] = useState('public');
  const [items, setItems] = useState([]), [cursor, setCursor] = useState(null);
  const [detail, setDetail] = useState(null), [draft, setDraft] = useState(null), [poster, setPoster] = useState(null);
  const [reviewPoster, setReviewPoster] = useState(null), [feedback, setFeedback] = useState('');
  const [templates, setTemplates] = useState([]), [templateCursor, setTemplateCursor] = useState(null);
  const [responses, setResponses] = useState([]), [responseCursor, setResponseCursor] = useState(null);
  const [answers, setAnswers] = useState({}), [places, setPlaces] = useState('1'), [errors, setErrors] = useState({});
  const [selectedOccurrences,setSelectedOccurrences] = useState([]);
  const [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [obscured, setObscured] = useState(false);
  const [confirm, setConfirm] = useState(null), [pendingPoster, setPendingPoster] = useState(null), [retrySubmission, setRetrySubmission] = useState(false);
  const epoch = useRef(0), lock = useRef(false), currentId = useRef(null), createKey = useRef(null), submission = useRef(null), templateRequest = useRef(null);
  const member = Boolean(user?.uid && !user.isAnonymous), admin = member && ['admin', 'superAdmin'].includes(profile?.role);
  const requireMember = () => { if (member) return true; onRequireSignIn?.(); return false; };
  const run = async work => {
    if (!enabled || lock.current) return;
    const token = epoch.current; lock.current = true; setBusy(true); setNotice('');
    const valid = () => token === epoch.current;
    try { await work(valid); } catch (error) { if (valid()) setNotice(`${error?.message || 'The request could not be confirmed.'} Reload current status before repeating a change.`); }
    finally { if (valid()) { lock.current = false; setBusy(false); } }
  };
  const clearPrivate = () => { setDetail(null); setPoster(null); setReviewPoster(null); setFeedback(''); setResponses([]); setAnswers({}); setConfirm(null); };
  const list = (nextScope = scope, next = null) => run(async valid => {
    clearPrivate(); setPendingPoster(null); currentId.current = null; setDraft(null); setStage('list');
    const result = await api.list({ scope: nextScope, city, cursor: next });
    if (!valid()) return;
    setItems(current => mergeRegistrationPage(next ? current : [], result.events || [])); setCursor(result.nextCursor); setScope(nextScope);
  });
  const open = (id, action) => run(async valid => {
    clearPrivate(); setDraft(null); if (action === 'responses') setStage('loading'); if (currentId.current !== id) setPendingPoster(null); currentId.current = id;
    const fresh = !action || action === 'history' ? await (api.card || api.load)(id) : await api.load(id, action === 'register');
    if (!valid()) return;
    setDetail(fresh); submission.current = null; setRetrySubmission(false);
    // Keep the destination in its loading state until responses are ready.
    // Rendering the legacy card here caused a visible intermediate-page flash.
    if (action === 'responses') {
      if (!fresh.canManage) throw new Error('You cannot view responses for this event.');
      const result = await api.responses(id);
      if (valid()) { setResponses(result.registrations || []); setResponseCursor(result.nextCursor); setStage('responses'); }
      return;
    }
    setStage('card');
    if (registrationEventEnded(fresh) && action !== 'responses') return;
    if (action === 'register') {
      if (!requireMember()) return;
      if (!registrationEntryAllowed(fresh)) { setNotice('Registration cannot be edited at this time.'); return; }
      setAnswers(answersForReview(fresh)); setPlaces(String(fresh.ownRegistration?.status === 'registered' ? fresh.ownRegistration.places : 1));
      setSelectedOccurrences(fresh.occurrences?.length ? [fresh.event.id] : []);
      setErrors({}); setStage('entry');
    } else if (['edit', 'form', 'copy'].includes(action)) {
      if (!fresh.canManage) throw new Error('You cannot edit this event.');
      setDraft(eventDraftFromDetail(fresh, eventTypes)); setStage('editor');
      if (action === 'copy') { createKey.current = reference(); currentId.current = null; setDetail(null); setDraft(current => ({ ...current, seriesId:undefined, occurrenceIndex:undefined, occurrenceCount:undefined, recurrenceRule:undefined })); }
      loadTemplates(valid).catch(error => { if (valid()) setNotice(error.message || 'Saved templates unavailable; built-in templates are ready.'); });
    } else if (action === 'approve') {
      if (!fresh.canApprove || !(fresh.event.status === 'pending' || fresh.event.hasPendingChanges)) throw new Error('This event is no longer awaiting your approval. Reload current status.');
      setNotice('Review the event, private poster and registration form before choosing an approval action.');
    }
  });
  const loadTemplates = async (valid, next = null) => {
    const result = await api.templates(next);
    if (valid()) { setTemplates(current => mergeRegistrationPage(next ? current : [], result.templates || [])); setTemplateCursor(result.nextCursor); }
  };
  const edit = (isNew = false) => {
    if (!requireMember()) return;
    run(async valid => {
      const fresh = isNew ? null : await api.load(detail.event.id);
      if (!valid()) return;
      if (fresh && registrationEventEnded(fresh)) { setDetail(fresh); setStage('card'); return; }
      if (isNew) { createKey.current = reference(); currentId.current = null; setDetail(null); setPendingPoster(null); }
      else setDetail(fresh);
      setDraft(isNew ? { ...createDraft(), startTime: '', endTime: '', title: '', address: '', suburb: '', eventType: eventTypes[0], customEventType: '' } : eventDraftFromDetail(fresh, eventTypes));
      setStage('editor'); setPendingPoster(null); setPoster(null); setReviewPoster(null); loadTemplates(valid).catch(error => { if (valid()) setNotice(error.message || 'Saved templates unavailable; built-in templates are ready.'); });
    });
  };
  useEffect(() => {
    if (!enabled) return undefined;
    if (initialEventId) open(initialEventId, initialAction); else if (initialCreate && member) edit(true); else if (!operationsOnly) list('public');
    const hide = () => {
      if (document.hidden) { epoch.current++; lock.current = false; setBusy(false); setObscured(true); clearPrivate(); setDraft(null); setTemplates([]); setPendingPoster(null); }
      else { setObscured(false); if (currentId.current) open(currentId.current, operationsOnly ? initialAction : undefined); else if (!operationsOnly) list('public'); else if (initialCreate) edit(true); }
    };
    document.addEventListener('visibilitychange', hide);
    return () => { epoch.current++; lock.current = false; document.removeEventListener('visibilitychange', hide); };
  }, [enabled]); // Parent remounts by account, city and entry route; private state cannot cross sessions.
  const uploadSelectedPosters = async (events, selected, valid, reload = false) => {
    const failed = [], problems = [];
    for (const [index, event] of events.entries()) {
      if (!valid()) return '';
      try {
        const current = reload ? (await api.load(event.eventId)).event : { id:event.eventId, revision:event.revision };
        if (!valid()) return '';
        await api.uploadPoster(current.id, current.revision, selected.mime, selected.base64);
      } catch (error) {
        failed.push(event.eventId); problems.push(error.message || 'Poster upload could not be confirmed.');
        if (String(error.code).endsWith('resource-exhausted')) {
          failed.push(...events.slice(index + 1).map(row => row.eventId));
          problems.push('The existing poster upload limit was reached. Retry the remaining posters after the quota resets; do not create the series again.');
          break;
        }
      }
    }
    if (valid()) setPendingPoster(failed.length ? { ...selected, eventIds:failed } : null);
    return failed.length ? `Event saved, but poster upload was not confirmed${failed.length > 1 ? ` for ${failed.length} occurrences` : ''}. ${[...new Set(problems)].join(' ')} Reload the card before retrying.` : '';
  };
  const save = (nextDraft, seriesPlan) => run(async valid => {
    if (seriesPlan && detail) throw new Error('An existing occurrence must be edited individually, not created as another series.');
    const result = seriesPlan
      ? await api.createSeries({ createKey:createKey.current, city, draft:nextDraft, ...seriesPlan })
      : await api.save({ ...(detail ? { eventId: detail.event.id, expectedRevision: detail.event.revision } : { createKey: createKey.current }), city: detail?.event.city || city, draft: nextDraft });
    const savedEvents = seriesPlan ? result.events : [result];
    if (!savedEvents?.length) throw new Error('The server did not return the saved event identifiers. Reload before retrying.');
    if (seriesPlan && (savedEvents.length !== seriesPlan.occurrences.length || new Set(savedEvents.map(event => event.eventId)).size !== savedEvents.length || savedEvents.some(event => !event.eventId || event.revision !== 1 || event.status !== 'pending'))) throw new Error('The series result did not confirm every pending occurrence. Reload My Events before retrying.');
    const saved = savedEvents[0];
    if (!valid()) return;
    currentId.current = saved.eventId;
    const posterError = nextDraft.poster ? await uploadSelectedPosters(savedEvents, { ...nextDraft.poster,
      eventDates:Object.fromEntries(savedEvents.map((event,index) => [event.eventId, seriesPlan?.occurrences[index]?.date || nextDraft.date])) }, valid) : '';
    if (!valid()) return;
    const fresh = await api.load(saved.eventId);
    if (!valid()) return;
    setDetail(fresh); setDraft(null); setStage('host-confirmation');
    setNotice((seriesPlan ? `${savedEvents.length} separate registration events saved for administrator approval. Manage each occurrence in My Events. ` : '') + (posterError || (fresh.event.hasPendingChanges ? 'Changes submitted for administrator approval. The last approved version remains published.'
      : fresh.event.status === 'approved' ? 'Changes saved; your event remains approved.' : 'Saved for administrator approval.')));
  });
  const startEntry = () => {
    if (!requireMember()) return;
    run(async valid => {
      const fresh = await api.load(detail.event.id,true);
      if (!valid()) return;
      setDetail(fresh);
      if (!registrationEntryAllowed(fresh)) { setNotice('Registration cannot be edited at this time.'); setStage('card'); return; }
      setAnswers(answersForReview(fresh)); setPlaces(String(fresh.ownRegistration?.status === 'registered' ? fresh.ownRegistration.places : 1));
      setSelectedOccurrences(fresh.occurrences?.length ? [fresh.event.id] : []);
      submission.current = null; setRetrySubmission(false); setErrors({}); setStage('entry');
    });
  };
  const submit = e => {
    e?.preventDefault();
    if (!registrationEntryAllowed(detail)) { submission.current=null; setRetrySubmission(false); setStage('card'); return; }
    if (!submission.current) {
      const nextErrors = validateAnswers(detail.form.fields, answers, places, detail.occurrences?.length ? 5 : detail.event.capacity);
      if ((!detail.occurrences?.length || selectedOccurrences.includes(detail.event.id)) && !detail.canRegister && Number(places) > Number(detail.ownRegistration?.places || 0)) nextErrors.places = 'After closing, you can reduce places but cannot add places.';
      setErrors(nextErrors); if (Object.keys(nextErrors).length) return;
      try { submission.current = detail.occurrences?.length
        ? occurrenceSubmission(detail,selectedOccurrences,answers,places,reference())
        : createSubmission(detail.event.id, detail.form.version, detail.ownRegistration, answers, places, reference());
      } catch(error) { setErrors({places:error.message}); return; }
    }
    setRetrySubmission(true);
    run(async valid => {
      const request=submission.current;
      let result;
      try { result=request.occurrences ? await api.submitOccurrences(request) : await api.submit(request); }
      catch (error) {
        let latest; try { latest=await api.load(detail.event.id); } catch (_) { /* Preserve the original request on an offline/ambiguous failure. */ }
        if (valid() && registrationEventEnded(latest)) { clearPrivate(); setDetail(latest); setAnswers({}); submission.current=null; setRetrySubmission(false); setStage('card'); setNotice('This event was cancelled or deleted. Your saved registration is read-only.'); return; }
        throw error;
      }
      const fresh = await api.load(request.occurrences?.[0]?.eventId || detail.event.id);
      if (!valid()) return;
      setDetail(fresh); setStage(registrationEventEnded(fresh) ? 'card' : 'confirmation'); setAnswers({}); submission.current = null; setRetrySubmission(false);
      if (request.occurrences && !registrationEventEnded(fresh)) setNotice(`Registration confirmed for ${result.registrations.length} selected occurrences. Each booking is available in My Events → My registrations.`);
      if (operationsOnly && !registrationEventEnded(fresh)) (onSubmitted || onBack)?.(fresh.event);
    });
  };
  const responsePage = (next = null) => run(async valid => {
    const result = await api.responses(detail.event.id, next);
    if (valid()) { setResponses(current => mergeRegistrationPage(next ? current : [], result.registrations || [])); setResponseCursor(result.nextCursor); setStage('responses'); }
  });
  const ask = (title, description, action) => setConfirm({ title, description, action });
  const reloadAfter = async (valid, message) => { clearPrivate(); const fresh = await api.load(currentId.current); if (valid()) { setDetail(fresh); setStage('card'); setNotice(message); } };
  const links = detail?.privateDetails ? privateVenueLinks(detail.privateDetails) : null;
  const reviewDetail = registrationReviewDetail(detail);
  const pageTitle = detail && ['card','confirmation','host-confirmation'].includes(stage) ? 'Registration Only - Event details' : stage === 'responses' ? 'Registration responses'
    : stage === 'entry' && detail ? `${detail.ownRegistration?.status === 'registered' ? 'Edit registration' : 'Register'} · ${detail.event.title}`
    : operationsOnly ? initialCreate ? 'Create registration event' : ['edit', 'form', 'copy'].includes(initialAction) ? 'Edit event and registration form' : initialAction === 'responses' ? 'Registration responses' : 'Event registration' : 'Registration only events';
  if (!enabled) return <section className="card"><p>Registration is not enabled for this release.</p><BackControl onClick={onBack} label="Back"/></section>;
  if (obscured) return <section className="card"><p>Private registration details are hidden while the app is inactive.</p></section>;
  return <main className="registration-workspace" aria-label="Event registration"><PagePanel page="registration" title={pageTitle} subtitle={`${cityLabel(city)} · Manage your event registration securely.`} onBack={onBack} backLabel="Back to Events" backDisabled={busy}/>
    <div className="registration-actions registration-toolbar">{!operationsOnly && <button className="btn-light" disabled={busy} onClick={() => list(scope)}>Event list</button>}{currentId.current && <button disabled={busy} onClick={() => open(currentId.current, operationsOnly ? initialAction : undefined)}>Reload current status</button>}</div>
    {busy && <p className="registration-notice" role="status">Loading registration details…</p>}{notice && <p className="registration-notice" role="status">{notice}</p>}
    {confirm && <section className="registration-confirm" aria-label={confirm.title}><h2>{confirm.title}</h2><p>{confirm.description}</p><div className="registration-actions"><button disabled={busy} onClick={() => setConfirm(null)}>Cancel</button><button className="registration-primary" disabled={busy} onClick={() => { const action = confirm.action; setConfirm(null); run(action); }}>Confirm {confirm.title.toLowerCase()}</button></div></section>}
    {stage === 'list' && !operationsOnly && <><nav className="registration-actions" aria-label="Registration lists"><button disabled={busy} onClick={() => list('public')}>Browse events</button>{member && <><button disabled={busy} onClick={() => list('attending')}>My registrations</button><button disabled={busy} onClick={() => list('mine')}>My hosted events</button></>}{admin && <button disabled={busy} onClick={() => list('review')}>Review city events</button>}<button disabled={busy} onClick={() => edit(true)}>Create registration event</button></nav>
      {!items.length && !busy && <p>No events on this page.{cursor ? ' Load more to continue.' : ''}</p>}{items.map(event => <article className="card" key={event.id}><h2>{event.title}</h2><p>{event.eventType} · {event.date} · {event.suburb}</p><p>{event.status === 'cancelled' ? 'Event cancelled' : event.status} · Registration required</p><button disabled={busy} onClick={() => open(event.id)}>View event</button></article>)}{cursor && <button disabled={busy} onClick={() => list(scope, cursor)}>Load more events</button>}
    </>}
    {stage === 'editor' && draft && <RegistrationEditor showBackControl={false} initialDraft={draft} user={user} profile={profile} initialStep={initialAction === 'form' ? 'form' : 'event'} hasPoster={Boolean(reviewDetail?.privateDetails?.hasPoster)} onRemovePoster={() => ask('Remove poster', 'Remove the private poster? Changes to an approved event require approval; its published poster stays visible until then. Unsaved editor fields will stay in this editor.', async valid => {
      await api.removePoster(detail.event.id, detail.event.revision);
      const fresh = await api.load(detail.event.id);
      if (valid()) { setDetail(fresh); setNotice(fresh.event.hasPendingChanges ? 'Poster removal submitted for approval. The published poster is unchanged.' : 'Poster removed.'); }
    })} eventTypes={eventTypes} templates={templates} templateCursor={templateCursor} onMoreTemplates={() => run(valid => loadTemplates(valid, templateCursor))} busy={busy} onSave={save} onCancel={detail ? () => setStage('card') : undefined} onSaveTemplate={template => run(async valid => {
      const content = JSON.stringify(template);
      if (templateRequest.current?.content !== content) templateRequest.current = { content, id: reference() };
      await api.saveTemplate({ ...template, templateId: templateRequest.current.id }); loadTemplates(valid).catch(error => { if (valid()) setNotice(error.message || 'Saved templates unavailable; built-in templates are ready.'); }); if (valid()) { templateRequest.current = null; setNotice('Template saved to your account.'); }
    })}/>}
    {detail && ['card', 'confirmation', 'host-confirmation'].includes(stage) && <article className="card registration-event-card">
      {stage === 'confirmation' && <h2>{detail.ownRegistration?.status === 'registered' ? 'Registration confirmed' : 'Registration status updated'}</h2>}{stage === 'host-confirmation' && <h2>Event saved</h2>}
      <RegistrationSummary event={detail.event} places={detail.event.status !== 'cancelled' && detail.ownRegistration?.status === 'registered' ? detail.ownRegistration.places : 0}/>
      {detail.event.status === 'cancelled' && <p role="status">{detail.event.deleted ? 'Event deleted' : 'Event cancelled'} — no places reserved</p>}{detail.event.notes && <p className="registration-event-notes">{detail.event.notes}</p>}
      {detail.privateDetails ? <section className="registration-venue-panel"><h3>Private venue</h3><p>{detail.privateDetails.address}</p>{links && <div className="registration-actions"><a href={links.map} target="_blank" rel="noreferrer">View map</a><a href={links.directions} target="_blank" rel="noreferrer">Directions</a></div>}{detail.privateDetails.hasPoster && <button disabled={busy} onClick={() => run(async valid => { const result = await api.poster(detail.event.id); if (valid() && ['image/jpeg','image/png','image/webp'].includes(result.mime)) setPoster(`data:${result.mime};base64,${result.base64}`); })}>View private poster</button>}{poster && <img className="registration-poster" src={poster} alt="Private event poster"/>}</section> : <p>{detail.event.status === 'cancelled' ? 'Private venue and poster access is no longer available.' : 'The full address and poster are available after confirmed registration.'}</p>}
      {detail.ownRegistration && <section className="registration-venue-panel"><h3>{detail.event.status === 'cancelled' ? 'Registration history' : 'My registration · Read only'}</h3><p>{detail.ownRegistration.places} places · {detail.ownRegistration.status}</p>{!detail.ownRegistration.fields && <button disabled={busy} onClick={() => run(async valid=>{const fresh=await api.load(detail.event.id);if(valid())setDetail(fresh);})}>View saved registration</button>}{detail.ownRegistration.answersDeletedAt ? <p>Answers deleted.</p> : <RegistrationFields fields={detail.ownRegistration.fields} answers={detail.ownRegistration.answers} places={detail.ownRegistration.places} readOnly/>}</section>}
      {detail.registrationNeedsReview && <p role="alert">The organiser changed the form. Please review your answers and agree to the current terms again.</p>}
      {!detail.canRegister && <p>{detail.canEditRegistration ? 'New registrations are closed. You can update answers or reduce places until event day.' : 'Registration is closed or unavailable.'}</p>}
      <div className="registration-actions">
        {(detail.canRegister || detail.canEditRegistration) && <button className="registration-primary" disabled={busy} onClick={startEntry}>{detail.ownRegistration?.status === 'registered' ? 'Edit registration' : 'Register for event'}</button>}
        {detail.canCancel && <button className="btn-light registration-delete" disabled={busy} onClick={() => ask(detail.event.status === 'cancelled' ? 'Delete registration data' : 'Delete registration', detail.event.status === 'cancelled' ? 'Permanently delete your saved answers for this unavailable event and remove it from your history.' : 'Your answers will be deleted and your places released. You will lose private venue and poster access.', async valid => { await api.cancel(detail.event.id, detail.ownRegistration.revision); if (detail.event.status === 'cancelled') { if(valid()) { if(operationsOnly) (onSubmitted||onBack)?.(detail.event); else await list('attending'); } return; } await reloadAfter(valid, 'Your registration and submitted answers were deleted.'); })}>{detail.event.status === 'cancelled' ? 'Delete my registration data' : 'Delete my registration'}</button>}
        {detail.canManage && <>{detail.event.status !== 'cancelled' && <button disabled={busy} onClick={() => edit()}>Edit event and form</button>}<button disabled={busy} onClick={() => responsePage()}>Registration responses</button>
          {reviewDetail.privateDetails?.hasPoster && <button disabled={busy} onClick={() => ask('Remove poster', 'Remove the private poster? An approved event keeps its published poster until this change is approved.', async valid => { await api.removePoster(detail.event.id, detail.event.revision); await reloadAfter(valid, 'Poster removal saved. Changes to an approved event require administrator approval.'); })}>Remove private poster</button>}
          {pendingPoster && <><p role="status">Poster uploads pending for: {pendingPoster.eventIds.map(id => pendingPoster.eventDates[id]).join(', ')}. Retry uploads only; the events are already saved.</p><button disabled={busy} onClick={() => run(async valid => {
            const problem = await uploadSelectedPosters(pendingPoster.eventIds.map(eventId => ({eventId})), pendingPoster, valid, true);
            if (valid()) await reloadAfter(valid, problem || 'Poster uploaded.');
          })}>Retry selected poster upload</button></>}
        </>}
        {detail.canApprove && (detail.event.status === 'pending' || detail.event.hasPendingChanges) && <button disabled={busy || !reviewDetail.form || !reviewDetail.privateDetails || (reviewDetail.privateDetails.hasPoster && !reviewPoster)} onClick={() => ask('Approve event', 'Confirm you have reviewed the submitted event details, venue, poster and registration form below.', async valid => { await api.approve(detail.event.id, detail.event.revision); await reloadAfter(valid, 'Event approved.'); })}>Approve event</button>}
      </div>
      {detail.canApprove && detail.event.seriesId && <SeriesApproval key={detail.event.id} api={api} event={detail.event} disabled={busy} onApproved={()=>open(detail.event.id)}/>}
      {detail.canManage && reviewDetail.form && <details open={initialAction === 'approve'}><summary>{detail.pendingChanges ? 'Review submitted changes' : 'Review registration form'}</summary>
        <RegistrationReview detail={reviewDetail} poster={reviewPoster} busy={busy} onPoster={() => run(async valid => {
          const result = await api.poster(detail.event.id, detail.pendingChanges ? 'pending' : undefined);
          if (!['image/jpeg','image/png','image/webp'].includes(result.mime)) throw new Error('Unsupported event poster format.');
          if (valid()) setReviewPoster(`data:${result.mime};base64,${result.base64}`);
        })}/>
        {detail.canApprove && (detail.event.status === 'pending' || detail.event.hasPendingChanges) && <><label>Feedback for organiser<textarea maxLength={2000} value={feedback} onChange={event => setFeedback(event.target.value)} disabled={busy}/></label><div className="registration-actions">{[['rejected', 'Reject event'], ['changes-requested', 'Suggest changes']].map(([decision, label]) => <button key={decision} disabled={busy || !feedback.trim()} onClick={() => ask(label, 'Send this feedback to the organiser?', async valid => { await api.review(detail.event.id, detail.event.revision, decision, feedback.trim()); await reloadAfter(valid, 'Review feedback sent.'); })}>{label}</button>)}</div></>}
        </details>}
    </article>}
    {stage === 'entry' && detail?.form && <form noValidate onSubmit={submit} className="card registration-entry-card">
      <RegistrationSummary event={detail.event}/><p>{detail.form.purpose}</p>
      <OccurrencePicker detail={detail} places={places} selected={selectedOccurrences} onChange={setSelectedOccurrences} disabled={busy || retrySubmission}/>
      <fieldset disabled={busy || retrySubmission} className="registration-fields">
        <label>Number of attendees<input type="number" min="1" max={detail.occurrences?.length ? 5 : Math.min(5, detail.canRegister ? detail.event.capacity : detail.ownRegistration?.places)} value={places} onChange={e => setPlaces(e.target.value)}/></label>
        {errors.places && <p role="alert">{errors.places}</p>}
        <RegistrationFields fields={detail.form.fields} answers={answers} places={places} errors={errors} onChange={(id,value) => setAnswers(current => ({...current,[id]:value}))}/>
      </fieldset>
      <p>Availability is confirmed by the server when you submit.</p>
      {retrySubmission && !busy && <p>The last request is unconfirmed. Retry the same submission, or reload current status before editing.</p>}
      <button className="registration-submit" disabled={busy} type="submit">{retrySubmission ? 'Retry same submission' : 'Confirm registration'}</button>
    </form>}
    {stage === 'responses' && detail?.canManage && <section className="card registration-response-tools"><h2>Attendee responses</h2><p>Open a name to review their answers, or export all responses to Excel.</p><button disabled={busy || !responses.length} onClick={() => run(async valid => {
      let rows = [], cursor = null; const seen = new Set();
      do { const page = await api.responses(detail.event.id, cursor); if (!valid()) return; rows = mergeRegistrationPage(rows, page.registrations || []); cursor = page.nextCursor; if (cursor && seen.has(cursor)) throw new Error('Response pagination did not advance.'); if (cursor) seen.add(cursor); } while (cursor);
      const XLSX = await import('xlsx');
      const labels = [...new Set(rows.flatMap(row => (row.fields || []).map(field => field.label)))];
      const data = [['Name', 'Status', 'Places', 'Submitted at', ...labels], ...rows.map(row => [registrantName(row), row.status, row.places, row.submittedAt || '', ...labels.map(label => { const fields = (row.fields || []).filter(field => field.label === label); return fields.map(field => answerText(row.answers?.[field.id])).join(' / '); })])];
      const sheet = XLSX.utils.aoa_to_sheet(data); sheet['!cols'] = data[0].map((_, i) => ({ wch: i === 0 ? 28 : 24 })); sheet['!autofilter'] = { ref: sheet['!ref'] };
      const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, 'Responses'); XLSX.writeFile(book, 'registration-responses.xlsx'); if (valid()) setNotice(`${rows.length} responses exported.`);
    })}>Download all responses Excel</button>{responses.map(row => <details className="card registration-response" key={row.registrationId}>
      <summary>{registrantName(row)}</summary>
      <section aria-label="Submitted registration form"><h3>Registration form</h3><p>{row.status} · {row.places} {row.places === 1 ? 'place' : 'places'}</p>{!row.answersDeletedAt && <><p className="small">Submitted registration · Read only</p><RegistrationFields fields={row.fields} answers={row.answers} places={row.places} readOnly/></>}{row.answersDeletedAt ? <p>Answers deleted.</p> : <button disabled={busy} onClick={() => ask('Delete answers', 'This permanently deletes the form answers without changing the reserved places.', async valid => { await api.deleteAnswers(detail.event.id, row.registrationId, row.revision, 'DELETE ANSWERS'); if (valid()) { setResponses(current => current.filter(item => item.registrationId !== row.registrationId)); setNotice('Answers deleted. Reserved places are unchanged.'); } })}>Permanently delete answers only</button>}</section>
    </details>)}{responseCursor && <button disabled={busy} onClick={() => responsePage(responseCursor)}>Load more responses</button>}</section>}
  </main>;
}
