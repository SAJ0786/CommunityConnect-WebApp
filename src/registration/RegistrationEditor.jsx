import React, { useEffect, useRef, useState } from 'react';
import AddressAutocomplete from '../components/AddressAutocomplete';
import AnswerField from './AnswerField';
import { FIELD_TYPES, FORM_TEMPLATES, NOTES_LIMIT, TERMS_LIMIT, closingDateError, consentLast, makeField, moveField, publicNotesError, publicSuburbError, templateFields } from './prototypeModel.mjs';
import { normalisePrivateVenue } from './privateVenue.mjs';
import { validateRegistrationDraft } from './registrationViewModel.mjs';

// Private drafts stay in component memory only, never localStorage/IndexedDB.
export default function RegistrationEditor({ initialDraft, initialStep = 'event', hasPoster = false, onRemovePoster, eventTypes, templates, templateCursor, onMoreTemplates, busy, onSave, onSaveTemplate, onCancel }) {
  const [draft, setDraft] = useState(initialDraft), [step, setStep] = useState(initialStep);
  const [error, setError] = useState(''), [templateName, setTemplateName] = useState('');
  const serial = useRef(0), posterRead = useRef(0);
  useEffect(() => () => { posterRead.current++; }, []);
  const update = (key, value) => setDraft(current => ({ ...current, [key]: value }));
  const change = (id, values) => update('fields', draft.fields.map(field => field.id === id ? { ...field, ...values } : field));
  const choose = template => { setDraft(current => ({ ...current, fields: consentLast(structuredClone(template.fields)), purpose: template.purpose || current.purpose })); setStep('form'); };
  const validation = () => [...validateRegistrationDraft(draft), ...(!normalisePrivateVenue(draft.venue) ? ['Select a complete address with coordinates for the private map and directions.'] : [])];
  const save = () => { const errors = validation(); setError(errors.join(' ')); if (!errors.length) onSave(draft); };
  const readPoster = async e => {
    const file = e.target.files?.[0], request = ++posterRead.current;
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) { setError('Choose a JPEG, PNG or WebP image up to 5 MB.'); return; }
    const reader = new FileReader();
    reader.onload = () => { if (request === posterRead.current) update('poster', { mime: file.type, base64: String(reader.result).split(',')[1], uri: reader.result }); };
    reader.onerror = () => { if (request === posterRead.current) setError('The poster could not be read.'); };
    reader.readAsDataURL(file);
  };
  const closeError = closingDateError(draft), notesError = publicNotesError(draft), suburbError = publicSuburbError(draft);
  return <section><div className="registration-actions">{onCancel && <button type="button" disabled={busy} className="btn-light" onClick={onCancel}>Back to event</button>}{step !== 'event' && <button type="button" disabled={busy} className="btn-light" onClick={() => setStep('event')}>Event details</button>}{step === 'preview' && <button type="button" onClick={() => setStep('form')}>Edit form</button>}</div>
    {error && <p role="alert">{error}</p>}<fieldset disabled={busy} className="registration-fields">
      {step === 'event' && <div className="card"><h2>Event details</h2>
        <label>Event title<input value={draft.title} maxLength={160} onChange={e => update('title', e.target.value)}/></label>
        <label>Event type<select value={draft.eventType} onChange={e => update('eventType', e.target.value)}>{[...new Set([...eventTypes, 'Custom'])].map(type => <option key={type}>{type}</option>)}</select></label>
        {draft.eventType === 'Custom' && <label>Custom event type<input value={draft.customEventType} maxLength={100} onChange={e => update('customEventType', e.target.value)}/></label>}
        <label>Event date<input type="date" value={draft.date} onChange={e => update('date', e.target.value)}/></label>
        <label>Start time (optional, event city timezone)<input type="time" value={draft.startTime || ''} onChange={e => update('startTime', e.target.value)}/></label>
        <label>End time (optional)<input type="time" value={draft.endTime || ''} onChange={e => update('endTime', e.target.value)}/></label>
        <p>An end time earlier than the start time means the following day.</p>
        <p>Leave times blank for a date-only event. No default start time will be added.</p>
        <h3>Private venue</h3><p>The full address, coordinates and poster are shown only to authorised attendees, organisers and administrators.</p>
        <AddressAutocomplete label="Private venue address" required value={draft.venue || { fullAddress: draft.address }} onChange={venue => setDraft(current => ({ ...current, venue, address: venue.fullAddress || '', suburb: venue.suburb || current.suburb }))}/>
        <label>Public suburb<input value={draft.suburb} maxLength={100} aria-invalid={Boolean(suburbError)} aria-describedby="registration-suburb-error" onChange={e => update('suburb', e.target.value)}/></label><p id="registration-suburb-error" role={suburbError ? 'alert' : undefined}>{suburbError || 'Do not include the street address here.'}</p>
        <label>Registration closes (optional)<input type="datetime-local" value={draft.closes} aria-invalid={Boolean(closeError)} aria-describedby="registration-closing-error" onChange={e => update('closes', e.target.value)}/><small id="registration-closing-error" role={closeError ? 'alert' : undefined}>{closeError || 'Must be an earlier day than the event. Blank closes at the start of event day in the city timezone.'}</small></label>
        <label>Capacity (places)<input type="number" min="1" max="10000" value={draft.capacity} onChange={e => update('capacity', e.target.value)}/></label>
        <label>Detailed notes — public<textarea value={draft.notes} maxLength={NOTES_LIMIT} aria-invalid={Boolean(notesError)} onChange={e => update('notes', e.target.value)}/></label>{notesError && <p role="alert">{notesError}</p>}
        <label className="registration-check"><input type="checkbox" checked={draft.allowCancellation} onChange={e => update('allowCancellation', e.target.checked)}/>Allow attendee cancellation before event day</label>
        <label>Private poster (optional)<input type="file" accept="image/jpeg,image/png,image/webp" onChange={readPoster}/></label>
        {draft.poster && <><img className="registration-poster" src={draft.poster.uri} alt="Selected private poster"/><button type="button" onClick={() => { posterRead.current++; update('poster', null); }}>Discard selected poster</button></>}
        {hasPoster && onRemovePoster && <button type="button" onClick={onRemovePoster}>Delete existing poster</button>}
        <p>A selected poster uploads after the event is saved.</p><button type="button" onClick={() => setStep('templates')}>Choose registration form</button>
      </div>}
      {step === 'templates' && <div className="card"><h2>Use a template or build your own?</h2><p>Templates can be customised.</p><div className="registration-actions">{FORM_TEMPLATES.map(template => <button type="button" key={template.name} onClick={() => choose({ fields: templateFields(template) })}>{template.name}</button>)}{templates.map(template => <button type="button" key={template.id} onClick={() => choose(template)}>{template.name} (saved)</button>)}{templateCursor && <button type="button" onClick={onMoreTemplates}>Load more templates</button>}<button type="button" onClick={() => choose({ fields: [] })}>Build my own form</button><button type="button" onClick={() => setStep('form')}>Continue current form</button></div></div>}
      {step === 'form' && <><div className="card"><label>Why are you collecting these answers?<textarea value={draft.purpose} maxLength={1000} onChange={e => update('purpose', e.target.value)}/></label></div>
        {draft.fields.map((field, index) => <section className="card" key={field.id}><h3>Question {index + 1} · {FIELD_TYPES.find(([type]) => type === field.type)?.[1]}</h3>
          <label>Question<input value={field.label} maxLength={200} onChange={e => change(field.id, { label: e.target.value })}/></label><label>Help text<input value={field.description || ''} maxLength={500} onChange={e => change(field.id, { description: e.target.value })}/></label>
          {['select', 'radio', 'checkboxes'].includes(field.type) && <label>Options — one per line<textarea value={field.options.join('\n')} onChange={e => change(field.id, { options: e.target.value.split('\n') })}/></label>}
          {field.type === 'consent' && <label>Your terms and conditions<textarea value={field.terms || ''} maxLength={TERMS_LIMIT} onChange={e => change(field.id, { terms: e.target.value })}/><small>Write the terms attendees must agree to. Agreement fields stay last.</small></label>}
          <label className="registration-check"><input type="checkbox" checked={field.required} disabled={field.type === 'consent'} onChange={e => change(field.id, { required: e.target.checked })}/>Required</label>
          <div className="registration-actions"><button type="button" disabled={index === 0} onClick={() => update('fields', moveField(draft.fields, index, -1))}>Move up</button><button type="button" disabled={index === draft.fields.length - 1} onClick={() => update('fields', moveField(draft.fields, index, 1))}>Move down</button><button type="button" onClick={() => update('fields', draft.fields.filter(row => row.id !== field.id))}>Remove question</button></div>
        </section>)}
        <div className="card"><h3>Add a question</h3><div className="registration-actions">{FIELD_TYPES.map(([type, label]) => <button type="button" key={type} disabled={draft.fields.length >= 30} onClick={() => update('fields', consentLast([...draft.fields, makeField(type, `q-${Date.now()}-${++serial.current}`)]))}>{label}</button>)}</div></div>
        <div className="card"><label>Save reusable template as<input value={templateName} maxLength={80} onChange={e => setTemplateName(e.target.value)}/></label><button type="button" disabled={!templateName.trim()} onClick={() => onSaveTemplate({ name: templateName, fields: draft.fields, purpose: draft.purpose })}>Save template without venue or answers</button></div>
        <button type="button" onClick={() => { const errors = validation(); setError(errors.join(' ')); if (!errors.length) setStep('preview'); }}>Preview attendee form</button>
      </>}
      {step === 'preview' && <section className="card"><h2>Attendee form preview</h2><p>{draft.purpose}</p><fieldset disabled>{draft.fields.map(field => <AnswerField key={field.id} field={field} onChange={() => {}}/>)}</fieldset><p>New events need initial approval. Approved-event edits retain approval. Changes to questions, date or venue queue attendee notifications; changed questions ask attendees to review their registration.</p><button type="button" onClick={save}>Save event and registration form</button></section>}
    </fieldset>
  </section>;
}
