import React, { useEffect, useRef, useState } from 'react';
import { EVENT_TYPES } from '../utils/constants';
import { cityLabel } from '../utils/cities';
import { createDraft, validateAnswers } from './prototypeModel.mjs';
import { createSubmission, registrationsCsv } from './registrationClient.mjs';
import { eventDraftFromDetail, answersForReview, mergeRegistrationPage } from './registrationViewModel.mjs';
import { privateVenueLinks } from './privateVenue.mjs';
import RegistrationEditor from './RegistrationEditor';
import AnswerField from './AnswerField';
import './workspace.css';

const reference = () => crypto.randomUUID();
const answerText = value => Array.isArray(value) ? value.join(', ') : value === true ? 'Agreed' : String(value ?? '');
// api is injected: no direct Firestore reads, persistence, capacity or permission authority here.
export default function RegistrationWorkspace({ api, enabled = false, user, profile, city, onBack, onRequireSignIn, initialCreate = false, initialEventId, eventTypes = EVENT_TYPES }) {
  const [stage, setStage] = useState('list'), [scope, setScope] = useState('public');
  const [items, setItems] = useState([]), [cursor, setCursor] = useState(null);
  const [detail, setDetail] = useState(null), [draft, setDraft] = useState(null), [poster, setPoster] = useState(null);
  const [templates, setTemplates] = useState([]), [templateCursor, setTemplateCursor] = useState(null);
  const [responses, setResponses] = useState([]), [responseCursor, setResponseCursor] = useState(null);
  const [answers, setAnswers] = useState({}), [places, setPlaces] = useState('1'), [errors, setErrors] = useState({});
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
  const clearPrivate = () => { setDetail(null); setPoster(null); setResponses([]); setAnswers({}); setConfirm(null); };
  const list = (nextScope = scope, next = null) => run(async valid => {
    clearPrivate(); currentId.current = null; setDraft(null); setStage('list');
    const result = await api.list({ scope: nextScope, city, cursor: next });
    if (!valid()) return;
    setItems(current => mergeRegistrationPage(next ? current : [], result.events || [])); setCursor(result.nextCursor); setScope(nextScope);
  });
  const open = id => run(async valid => {
    clearPrivate(); setDraft(null); currentId.current = id;
    const fresh = await api.load(id);
    if (!valid()) return;
    setDetail(fresh); setStage('card'); submission.current = null; setRetrySubmission(false);
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
      if (isNew) { createKey.current = reference(); currentId.current = null; setDetail(null); }
      else setDetail(fresh);
      setDraft(isNew ? { ...createDraft(), title: '', address: '', suburb: '', eventType: eventTypes[0], customEventType: '' } : eventDraftFromDetail(fresh, eventTypes));
      setStage('editor'); setPendingPoster(null); setPoster(null); await loadTemplates(valid);
    });
  };
  useEffect(() => {
    if (!enabled) return undefined;
    if (initialEventId) open(initialEventId); else if (initialCreate && member) edit(true); else list('public');
    const hide = () => {
      if (document.hidden) { epoch.current++; lock.current = false; setBusy(false); setObscured(true); clearPrivate(); setDraft(null); setTemplates([]); setPendingPoster(null); }
      else { setObscured(false); if (currentId.current) open(currentId.current); else list('public'); }
    };
    document.addEventListener('visibilitychange', hide);
    return () => { epoch.current++; lock.current = false; document.removeEventListener('visibilitychange', hide); };
  }, [enabled]); // Parent remounts by account, city and entry route; private state cannot cross sessions.
  const save = nextDraft => run(async valid => {
    const saved = await api.save({ ...(detail ? { eventId: detail.event.id, expectedRevision: detail.event.revision } : { createKey: createKey.current }), city: detail?.event.city || city, draft: nextDraft });
    if (!valid()) return;
    currentId.current = saved.eventId;
    let posterError = '';
    if (nextDraft.poster) {
      try { await api.uploadPoster(saved.eventId, saved.revision, nextDraft.poster.mime, nextDraft.poster.base64); if (valid()) setPendingPoster(null); }
      catch { posterError = 'Event saved, but poster upload was not confirmed. Reload the card before retrying.'; if (valid()) setPendingPoster(nextDraft.poster); }
    }
    const fresh = await api.load(saved.eventId);
    if (!valid()) return;
    setDetail(fresh); setDraft(null); setStage('host-confirmation');
    setNotice(posterError || (fresh.event.status === 'approved' ? 'Changes saved; your event remains approved. Eligible attendee notices are queued when questions, date or venue change.' : 'Saved for initial administrator approval.'));
  });
  const startEntry = () => {
    if (!requireMember()) return;
    run(async valid => {
      const fresh = await api.load(detail.event.id);
      if (!valid()) return;
      setDetail(fresh);
      if (!(fresh.canRegister || fresh.canEditRegistration) || !fresh.form) { setNotice('Registration cannot be edited at this time.'); setStage('card'); return; }
      setAnswers(answersForReview(fresh)); setPlaces(String(fresh.ownRegistration?.status === 'registered' ? fresh.ownRegistration.places : 1));
      submission.current = null; setRetrySubmission(false); setErrors({}); setStage('entry');
    });
  };
  const submit = e => {
    e?.preventDefault();
    if (!submission.current) {
      const nextErrors = validateAnswers(detail.form.fields, answers, places, detail.event.capacity);
      if (!detail.canRegister && Number(places) > Number(detail.ownRegistration?.places || 0)) nextErrors.places = 'After closing, you can reduce places but cannot add places.';
      setErrors(nextErrors); if (Object.keys(nextErrors).length) return;
      submission.current = createSubmission(detail.event.id, detail.form.version, detail.ownRegistration, answers, places, reference());
    }
    setRetrySubmission(true);
    run(async valid => {
      await api.submit(submission.current);
      const fresh = await api.load(detail.event.id);
      if (!valid()) return;
      setDetail(fresh); setStage('confirmation'); setAnswers({}); submission.current = null; setRetrySubmission(false);
    });
  };
  const responsePage = (next = null) => run(async valid => {
    const result = await api.responses(detail.event.id, next);
    if (valid()) { setResponses(current => mergeRegistrationPage(next ? current : [], result.registrations || [])); setResponseCursor(result.nextCursor); setStage('responses'); }
  });
  const ask = (title, description, action) => setConfirm({ title, description, action });
  const reloadAfter = async (valid, message) => { clearPrivate(); const fresh = await api.load(currentId.current); if (valid()) { setDetail(fresh); setStage('card'); setNotice(message); } };
  const links = detail?.privateDetails ? privateVenueLinks(detail.privateDetails) : null;
  if (!enabled) return <section className="card"><p>Registration is not enabled for this release.</p><button onClick={onBack}>Back</button></section>;
  if (obscured) return <section className="card"><p>Private registration details are hidden while the app is inactive.</p></section>;
  return <main className="registration-workspace" aria-label="Registration events"><h1>Registration only events</h1><p>{cityLabel(city)}</p>
    <div className="registration-actions"><button className="btn-light" disabled={busy} onClick={onBack}>Back to Events</button><button className="btn-light" disabled={busy} onClick={() => list(scope)}>Event list</button>{currentId.current && <button disabled={busy} onClick={() => open(currentId.current)}>Reload current status</button>}</div>
    {busy && <p role="status">Working…</p>}{notice && <p role="status">{notice}</p>}
    {confirm && <section className="registration-confirm" aria-label={confirm.title}><h2>{confirm.title}</h2><p>{confirm.description}</p><button disabled={busy} onClick={() => setConfirm(null)}>Go back</button><button disabled={busy} onClick={() => { const action = confirm.action; setConfirm(null); run(action); }}>Confirm {confirm.title.toLowerCase()}</button></section>}
    {stage === 'list' && <><nav className="registration-actions" aria-label="Registration lists"><button disabled={busy} onClick={() => list('public')}>Browse events</button>{member && <><button disabled={busy} onClick={() => list('attending')}>My registrations</button><button disabled={busy} onClick={() => list('mine')}>My hosted events</button></>}{admin && <button disabled={busy} onClick={() => list('review')}>Review city events</button>}<button disabled={busy} onClick={() => edit(true)}>Create registration event</button></nav>
      {!items.length && !busy && <p>No events on this page.{cursor ? ' Load more to continue.' : ''}</p>}{items.map(event => <article className="card" key={event.id}><h2>{event.title}</h2><p>{event.eventType} · {event.date} · {event.suburb}</p><p>{event.status === 'cancelled' ? 'Event cancelled' : event.status} · Registration required</p><button disabled={busy} onClick={() => open(event.id)}>View event</button></article>)}{cursor && <button disabled={busy} onClick={() => list(scope, cursor)}>Load more events</button>}
    </>}
    {stage === 'editor' && draft && <RegistrationEditor initialDraft={draft} eventTypes={eventTypes} templates={templates} templateCursor={templateCursor} onMoreTemplates={() => run(valid => loadTemplates(valid, templateCursor))} busy={busy} onSave={save} onCancel={() => detail ? setStage('card') : list(scope)} onSaveTemplate={template => run(async valid => {
      const content = JSON.stringify(template);
      if (templateRequest.current?.content !== content) templateRequest.current = { content, id: reference() };
      await api.saveTemplate({ ...template, templateId: templateRequest.current.id }); await loadTemplates(valid); if (valid()) { templateRequest.current = null; setNotice('Template saved to your account.'); }
    })}/>}
    {detail && ['card', 'confirmation', 'host-confirmation'].includes(stage) && <article className="card">
      {stage === 'confirmation' && <h2>{detail.ownRegistration?.status === 'registered' ? 'Registration confirmed' : 'Registration status updated'}</h2>}{stage === 'host-confirmation' && <h2>Event saved</h2>}
      <h2>{detail.event.title}</h2><p>{detail.event.eventType} · {detail.event.date} · {detail.event.suburb}</p><p>{detail.event.status === 'cancelled' ? 'Event cancelled — no places reserved' : detail.ownRegistration?.status === 'registered' ? `${detail.ownRegistration.places} places registered` : detail.event.status}</p><p>{detail.event.notes}</p>
      {detail.privateDetails ? <section><h3>Private venue</h3><p>{detail.privateDetails.address}</p>{links && <div className="registration-actions"><a href={links.map} target="_blank" rel="noreferrer">View map</a><a href={links.directions} target="_blank" rel="noreferrer">Directions</a></div>}{detail.privateDetails.hasPoster && <button disabled={busy} onClick={() => run(async valid => { const result = await api.poster(detail.event.id); if (valid() && ['image/jpeg','image/png','image/webp'].includes(result.mime)) setPoster(`data:${result.mime};base64,${result.base64}`); })}>View private poster</button>}{poster && <img className="registration-poster" src={poster} alt="Private event poster"/>}</section> : <p>{detail.event.status === 'cancelled' ? 'Private venue and poster access is no longer available.' : 'The full address and poster are available after confirmed registration.'}</p>}
      {detail.registrationNeedsReview && <p role="alert">The organiser changed the form. Please review your answers and agree to the current terms again.</p>}
      {!detail.canRegister && <p>{detail.canEditRegistration ? 'New registrations are closed. You can update answers or reduce places until event day.' : 'Registration is closed or unavailable.'}</p>}
      <div className="registration-actions">
        {(detail.canRegister || detail.canEditRegistration) && <button disabled={busy} onClick={startEntry}>{detail.ownRegistration?.status === 'registered' ? 'Edit registration' : 'Register for event'}</button>}
        {detail.canCancel && <button disabled={busy} onClick={() => ask('Delete registration', 'Your answers will be deleted and your places released. You will lose private venue and poster access.', async valid => { await api.cancel(detail.event.id, detail.ownRegistration.revision); await reloadAfter(valid, 'Your registration and submitted answers were deleted.'); })}>Delete my registration</button>}
        {detail.canManage && <><button disabled={busy || detail.event.status === 'cancelled'} onClick={() => edit()}>Edit event and form</button><button disabled={busy} onClick={() => responsePage()}>Registration responses</button>
          {detail.event.status !== 'cancelled' && <button disabled={busy} onClick={() => ask('Cancel event', 'This cannot be undone. All places will be released and attendee notifications queued. Answers remain subject to retention and deletion controls.', async valid => { await api.cancelEvent(detail.event.id, detail.event.revision, 'CANCEL EVENT'); await reloadAfter(valid, 'Event cancelled. Attendee notifications are queued.'); })}>Cancel whole event</button>}
          {detail.privateDetails?.hasPoster && <button disabled={busy} onClick={() => ask('Remove poster', 'The private poster will be removed. Approved events remain approved.', async valid => { await api.removePoster(detail.event.id, detail.event.revision); await reloadAfter(valid, 'Poster removed.'); })}>Remove private poster</button>}
          {pendingPoster && <button disabled={busy} onClick={() => run(async valid => { const fresh = await api.load(detail.event.id); await api.uploadPoster(fresh.event.id, fresh.event.revision, pendingPoster.mime, pendingPoster.base64); if (valid()) setPendingPoster(null); await reloadAfter(valid, 'Poster uploaded.'); })}>Retry selected poster upload</button>}
        </>}
        {detail.canApprove && detail.event.status === 'pending' && <button disabled={busy} onClick={() => ask('Approve event', 'Confirm you have reviewed the venue, poster and registration form.', async valid => { await api.approve(detail.event.id, detail.event.revision); await reloadAfter(valid, 'Event approved.'); })}>Approve event</button>}
      </div>
      {detail.canManage && detail.form && <details><summary>Review registration form</summary><p>{detail.form.purpose}</p>{detail.form.fields.map(field => <section key={field.id}><h3>{field.label}{field.required ? ' *' : ''}</h3><p>{field.description}</p><p>{field.terms || field.options?.join(', ')}</p></section>)}</details>}
    </article>}
    {stage === 'entry' && detail?.form && <form noValidate onSubmit={submit} className="card"><h2>{detail.ownRegistration?.status === 'registered' ? 'Edit registration' : 'Register'} · {detail.event.title}</h2><p>{detail.form.purpose}</p><fieldset disabled={busy || retrySubmission} className="registration-fields"><label>Number of attendees<input type="number" min="1" max={detail.canRegister ? detail.event.capacity : detail.ownRegistration?.places} value={places} onChange={e => setPlaces(e.target.value)}/></label>{errors.places && <p role="alert">{errors.places}</p>}{detail.form.fields.map(field => <AnswerField key={field.id} field={field} value={answers[field.id]} error={errors[field.id]} onChange={value => setAnswers(current => ({ ...current, [field.id]: value }))}/>)}</fieldset><p>Availability is confirmed by the server when you submit.</p>{retrySubmission && !busy && <p>The last request is unconfirmed. Retry the same submission, or reload current status before editing.</p>}<button disabled={busy} type="submit">{retrySubmission ? 'Retry same submission' : 'Confirm registration'}</button></form>}
    {stage === 'responses' && detail?.canManage && <section className="card"><h2>Registration responses</h2><p>Answers retain their original question labels. Only loaded responses are included in the download.</p><button disabled={busy || !responses.length} onClick={() => {
      const url = URL.createObjectURL(new Blob(['\ufeff' + registrationsCsv(responses)], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a'); a.href = url; a.download = 'registration-responses.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    }}>Download loaded responses CSV</button>{responses.map(row => <article className="card" key={row.registrationId}><h3>{row.registrationId}</h3><p>{row.status} · {row.places} places</p><dl>{(row.fields || []).map(field => <div key={field.id}><dt>{field.label}</dt><dd>{answerText(row.answers?.[field.id])}</dd></div>)}</dl>{row.answersDeletedAt ? <p>Answers deleted.</p> : <button disabled={busy} onClick={() => ask('Delete answers', 'This permanently deletes the form answers without changing the reserved places.', async valid => { await api.deleteAnswers(detail.event.id, row.registrationId, row.revision, 'DELETE ANSWERS'); if (valid()) { setResponses(current => current.filter(item => item.registrationId !== row.registrationId)); setNotice('Answers deleted. Reserved places are unchanged.'); } })}>Permanently delete answers only</button>}</article>)}{responseCursor && <button disabled={busy} onClick={() => responsePage(responseCursor)}>Load more responses</button>}</section>}
  </main>;
}
