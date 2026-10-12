import React, { useRef, useState } from 'react';
import { CalendarDays, Repeat2, ClipboardList, ArrowLeft, ArrowRight, Plus, Trash2, Eye, ShieldCheck, Check, Users, Bookmark, ChevronUp, ChevronDown } from 'lucide-react';
import { FIELD_TYPES, STANDARD_FIELDS, createDraft, makeField, moveField, validateDraft, validateAnswers, snapshotBooking } from './prototypeModel.mjs';
import './registration.css';

const stages = ['Choose event', 'Event setup', 'Build form', 'Attendee preview', 'Confirmation', 'Responses'];
const displayAnswer = value => Array.isArray(value) ? value.join(', ') : value === true ? 'Agreed' : value === false ? 'No' : String(value ?? 'Not provided');
export default function RegistrationPrototype() {
  const [stage, setStage] = useState(0);
  const [draft, setDraft] = useState(createDraft);
  const [answers, setAnswers] = useState({});
  const [places, setPlaces] = useState('1');
  const [errors, setErrors] = useState({});
  const [notice, setNotice] = useState('');
  const [booking, setBooking] = useState(null);
  const [saved, setSaved] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [templateName, setTemplateName] = useState('My workshop form');
  const serial = useRef(0);
  const heading = useRef(null);
  const changeStage = value => { setStage(value); setErrors({}); setNotice(''); requestAnimationFrame(() => { heading.current?.focus(); window.scrollTo(0, 0); }); };
  const update = (key, value) => setDraft(current => ({ ...current, [key]: value }));
  const editField = (id, changes) => setDraft(current => ({ ...current, fields: current.fields.map(field => field.id === id ? { ...field, ...changes } : field) }));
  const addField = field => {
    if (draft.fields.length >= 30) { setNotice('The prototype supports up to 30 questions.'); return; }
    update('fields', [...draft.fields, { description: '', options: [], ...field, id: `${field.id || 'custom'}-${++serial.current}` }]);
  };
  const preview = () => {
    const messages = validateDraft(draft);
    if (messages.length) { setErrors({ draft: messages.join(' ') }); return; }
    changeStage(3);
  };
  const submitDemo = event => {
    event.preventDefault();
    const next = validateAnswers(draft.fields, answers, places, draft.capacity);
    setErrors(next);
    if (Object.keys(next).length) return;
    setBooking(snapshotBooking(draft, answers, places));
    changeStage(4);
  };
  const saveTemplate = () => {
    if (!templateName.trim()) { setNotice('Name your template first.'); return; }
    setTemplates(current => [...current, { name: templateName.trim(), fields: JSON.parse(JSON.stringify(draft.fields)) }]);
    setNotice('Template saved for this preview session only.');
  };
  return <div className="registration-preview">
    <header className="rp-header"><div className="rp-brand"><CalendarDays aria-hidden="true" /><div><strong>COMMUNITY CONNECT</strong><span>Events · Registration studio</span></div></div><span className="rp-pill">Interactive prototype</span></header>
    <div className="rp-safety"><ShieldCheck size={18} aria-hidden="true" /><span>Demo only — use fictional details. No sign-in, Firebase writes, emails or real bookings. Drafts and templates reset on reload.</span></div>
    <main className="rp-main">
      <aside className="rp-sidebar"><p className="rp-eyebrow">YOUR EVENT, YOUR QUESTIONS</p><h2>A place for everyone.</h2><p>Create a registration experience that fits your community.</p><nav aria-label="Prototype screens">{stages.map((name, index) => <button key={name} aria-current={stage === index ? 'step' : undefined} disabled={index >= 4 && !booking} onClick={() => index === 3 ? preview() : changeStage(index)}><span>{index + 1}</span>{name}</button>)}</nav><p className="rp-small">Screen navigation is for reviewing the prototype. Production access will be permission-controlled.</p></aside>
      <section className="rp-workspace">
        <div className="rp-title"><div><p className="rp-eyebrow">{stage === 0 ? 'GET STARTED' : `STEP ${stage + 1} OF ${stages.length}`}</p><h1 ref={heading} tabIndex={-1}>{stages[stage]}</h1></div>{stage > 0 && <button className="rp-secondary" onClick={() => changeStage(stage - 1)}><ArrowLeft size={16} /> Back</button>}</div>
        {notice && <p role="status" className="rp-notice">{notice}</p>}
        {errors.draft && <p role="alert" className="rp-error">{errors.draft}</p>}
        {stage === 0 && <><p>Choose how people will attend. “Open” means registration is not required; visibility remains a separate setting.</p><div className="rp-choices">
          {[[CalendarDays, 'Open Single Event', 'One date. One gathering.', 'Continue using the existing single-event form.'], [Repeat2, 'Open Recurring Event', 'A regular place to connect.', 'Continue using the existing recurring-event form and permissions.']].map(([Icon, title, subtitle, detail]) => <button className="rp-choice" key={title} onClick={() => setNotice(`${detail} This isolated preview does not open or change the live app.`)}><span className="rp-icon"><Icon /></span><span><strong>{title}</strong><span>{subtitle}</span><small>No registration required</small></span><ArrowRight /></button>)}
          <button className="rp-choice rp-choice-featured" onClick={() => changeStage(1)}><span className="rp-icon"><ClipboardList /></span><span><small className="rp-new">NEW EXPERIENCE</small><strong>Registration Required Event</strong><span>Custom questions, limited places and private details.</span><small>Single-date event · Free registration</small></span><ArrowRight /></button>
        </div></>}
        {stage === 1 && <><div className="rp-panel"><h2>Tell us about your event</h2><p>Attendees see only the title, type, date and suburb before registration.</p><div className="rp-grid">
          <label>Event title<input value={draft.title} onChange={e => update('title', e.target.value)} maxLength={160} /></label>
          <label>Event type<input value={draft.eventType} onChange={e => update('eventType', e.target.value)} maxLength={80} /></label>
          <label>Event date<input type="date" value={draft.date} onChange={e => update('date', e.target.value)} /></label>
          <label>Suburb<input value={draft.suburb} onChange={e => update('suburb', e.target.value)} maxLength={100} /></label>
          <label>Capacity in places<input type="number" min="1" max="10000" value={draft.capacity} onChange={e => update('capacity', e.target.value)} /><small>A family of three uses three places.</small></label>
          <label>Registration closes (optional)<input type="datetime-local" value={draft.closes} onChange={e => update('closes', e.target.value)} /><small>Timezone handling will be added with server integration.</small></label>
        </div><label className="rp-check"><input type="checkbox" checked={draft.allowCancellation} onChange={e => update('allowCancellation', e.target.checked)} /> Allow attendees to cancel their registration</label></div><div className="rp-note"><ShieldCheck /><p>Precise venue, contact and attachments belong in a protected organiser section. This prototype deliberately contains no real venue or contact data.</p></div><div className="rp-actions"><button className="rp-primary" onClick={() => changeStage(2)}>Build registration form <ArrowRight size={18} /></button></div></>}
        {stage === 2 && <><div className="rp-panel"><div className="rp-row"><div><h2>Your registration form</h2><p>Choose what you need. Leave unnecessary personal details out.</p></div><span className="rp-pill">{draft.fields.length} questions</span></div>
          <label>Why are you collecting these answers?<textarea value={draft.purpose} onChange={e => update('purpose', e.target.value)} maxLength={1000} /></label>
          <div className="rp-toolbar"><button className="rp-secondary" onClick={() => { setSaved(JSON.parse(JSON.stringify(draft))); setNotice('Draft saved in this preview session. Reloading clears it.'); }}><Bookmark size={16} /> Save demo draft</button>{saved && <button className="rp-secondary" onClick={() => { setDraft(JSON.parse(JSON.stringify(saved))); setAnswers({}); setNotice('Saved demo draft restored.'); }}>Restore draft</button>}</div>
        </div><div className="rp-builder"><div className="rp-questions">{draft.fields.map((field, index) => <article className="rp-panel rp-question" key={field.id}>
          <div className="rp-row"><span className="rp-eyebrow">QUESTION {index + 1} · {FIELD_TYPES.find(([type]) => type === field.type)?.[1]}</span><div className="rp-toolbar"><button aria-label={`Move question ${index + 1} up`} disabled={index === 0} onClick={() => update('fields', moveField(draft.fields, index, -1))}><ChevronUp size={18} /></button><button aria-label={`Move question ${index + 1} down`} disabled={index === draft.fields.length - 1} onClick={() => update('fields', moveField(draft.fields, index, 1))}><ChevronDown size={18} /></button><button aria-label={`Remove question ${index + 1}`} onClick={() => update('fields', draft.fields.filter(f => f.id !== field.id))}><Trash2 size={16} /></button></div></div>
          <label>Question<input value={field.label} maxLength={200} onChange={e => editField(field.id, { label: e.target.value })} /></label><label>Help text (optional)<input value={field.description} maxLength={500} onChange={e => editField(field.id, { description: e.target.value })} /></label>
          {['select', 'radio', 'checkboxes'].includes(field.type) && <label>Options — one per line<textarea value={field.options.join('\n')} onChange={e => editField(field.id, { options: e.target.value.split('\n') })} /></label>}
          <label className="rp-check"><input type="checkbox" checked={field.required} onChange={e => editField(field.id, { required: e.target.checked })} /> Required answer</label>
        </article>)}</div><aside className="rp-panel rp-toolbox"><h3>Add a question</h3><p className="rp-small">Standard fields</p>{STANDARD_FIELDS.map(field => <button key={field.id} onClick={() => addField(field)}><Plus size={15} />{field.label}</button>)}<p className="rp-small">Custom questions</p>{FIELD_TYPES.map(([type, name]) => <button key={type} onClick={() => addField(makeField(type, 'custom'))}><Plus size={15} />{name}</button>)}</aside></div>
          <div className="rp-panel"><h3>Reusable templates</h3><label>Template name<input value={templateName} onChange={e => setTemplateName(e.target.value)} maxLength={80} /></label><div className="rp-toolbar"><button className="rp-secondary" onClick={saveTemplate}>Save form as template</button>{templates.map((template, i) => <button className="rp-secondary" key={i} onClick={() => { update('fields', JSON.parse(JSON.stringify(template.fields))); setAnswers({}); setNotice('Template applied. Other event settings are unchanged.'); }}>Use {template.name}</button>)}</div><small>Templates are session-only here. Account storage comes with backend integration.</small></div>
          <div className="rp-actions"><button className="rp-primary" onClick={preview}><Eye size={18} /> Preview attendee form</button></div></>}
        {stage === 3 && <><div className="rp-panel rp-summary"><span className="rp-pill">Registration required</span><h2>{draft.title}</h2><p>{draft.eventType} · {draft.date} · {draft.suburb}</p><p><ShieldCheck size={16} /> Full details are available after confirmed registration.</p></div><form noValidate onSubmit={submitDemo} className="rp-panel"><h2>Register your interest and places</h2><p>{draft.purpose}</p><p className="rp-small">You are previewing a signed-in attendee. No real identity is used. Fields marked * are required.</p><label>Number of attendees *<input type="number" min="1" max={draft.capacity} value={places} onChange={e => setPlaces(e.target.value)} /></label>{errors.places && <p role="alert" className="rp-error">{errors.places}</p>}
          {draft.fields.map(field => <AnswerField key={field.id} field={field} value={answers[field.id]} error={errors[field.id]} onChange={value => setAnswers(current => ({ ...current, [field.id]: value }))} />)}
          <p className="rp-note">Demo capacity: {draft.capacity} places. This preview checks your input only; real availability will be confirmed by the server at submission.</p><button className="rp-primary" type="submit">Try demo registration <ArrowRight size={18} /></button></form></>}
        {stage === 4 && booking && <div className="rp-panel rp-confirmation"><span className="rp-confirm-icon"><Check size={38} /></span><p className="rp-eyebrow">PREVIEW RESULT</p><h2>Your demo registration is confirmed</h2><p>No real places have been reserved.</p><div className="rp-summary"><strong>{draft.title}</strong><p>{booking.id} · {booking.places} {booking.places === 1 ? 'place' : 'places'} · Form version {booking.formVersion}</p></div><div className="rp-note"><ShieldCheck /><p>This is where confirmed attendees will see the protected venue and event details after Firebase authorisation is implemented.</p></div><div className="rp-toolbar"><button className="rp-primary" onClick={() => changeStage(5)}><Users size={18} /> View organiser response</button><button className="rp-secondary" onClick={() => changeStage(2)}>Return to form builder</button></div></div>}
        {stage === 5 && <div className="rp-panel"><div className="rp-row"><div><h2>Registration responses</h2><p>Organiser view · Read-only answers</p></div><span className="rp-pill">{booking ? '1 demo booking' : 'No bookings'}</span></div>{booking ? <><p>{booking.places} demo places · Form version {booking.formVersion} · {new Date(booking.submittedAt).toLocaleString('en-AU')}</p><p className="rp-small">Answers keep their original question labels even if you edit the form later.</p><dl className="rp-answers">{booking.fields.map(field => <div key={field.id}><dt>{field.label}</dt><dd>{displayAnswer(booking.answers[field.id])}</dd></div>)}</dl><p className="rp-note">CSV export, cancellation, permissions and live capacity are intentionally not connected in this screen prototype.</p></> : <p>Try a demo registration to see a response here.</p>}</div>}
      </section>
    </main><footer className="rp-footer">Community Connect Australia · Native + PWA design review · No production connection</footer>
  </div>;
}

function AnswerField({ field, value, error, onChange }) {
  const id = `answer-${field.id}`;
  const common = { id, 'aria-describedby': `${id}-help ${id}-error`, 'aria-invalid': Boolean(error), 'aria-required': field.required };
  return <div className="rp-answer"><label htmlFor={id}>{field.label}{field.required ? ' *' : ''}</label><p id={`${id}-help`} className="rp-small">{field.description}</p>
    {field.type === 'textarea' ? <textarea {...common} value={value || ''} maxLength={2000} onChange={e => onChange(e.target.value)} />
      : field.type === 'select' ? <select {...common} value={value || ''} onChange={e => onChange(e.target.value)}><option value="">Choose an option</option>{field.options.map(option => <option key={option}>{option}</option>)}</select>
      : field.type === 'consent' ? <label className="rp-check"><input {...common} type="checkbox" checked={value === true} onChange={e => onChange(e.target.checked)} /> I agree</label>
      : ['radio', 'checkboxes'].includes(field.type) ? <fieldset id={id} aria-describedby={`${id}-help ${id}-error`}><legend className="rp-small">Choose {field.type === 'radio' ? 'one' : 'all that apply'}</legend>{field.options.map(option => <label className="rp-check" key={option}><input type={field.type === 'radio' ? 'radio' : 'checkbox'} name={id} checked={field.type === 'radio' ? value === option : Array.isArray(value) && value.includes(option)} onChange={e => onChange(field.type === 'radio' ? option : e.target.checked ? [...(Array.isArray(value) ? value : []), option] : value.filter(v => v !== option))} />{option}</label>)}</fieldset>
      : <input {...common} type={{ email: 'email', phone: 'tel', number: 'number', date: 'date' }[field.type] || 'text'} step={field.type === 'number' ? 'any' : undefined} value={value ?? ''} maxLength={2000} onChange={e => onChange(e.target.value)} />}
    <p id={`${id}-error`} role={error ? 'alert' : undefined} className="rp-error">{error || ''}</p>
  </div>;
}
