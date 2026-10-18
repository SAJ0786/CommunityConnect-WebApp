import {ArrowUp,ArrowDown,Trash2} from 'lucide-react';
import EventPosterPicker from '../components/EventPosterPicker';
import React, { useEffect, useId, useRef, useState } from 'react';
import EventForm from '../components/EventForm';
import AnswerField from './AnswerField';
import { FIELD_TYPES, FORM_TEMPLATES, NOTES_LIMIT, TERMS_LIMIT, closingDateError, consentLast, makeField, moveField, publicNotesError, publicSuburbError, templateFields, registrationFieldGroups } from './prototypeModel.mjs';
import { normalisePrivateVenue } from './privateVenue.mjs';
import { registrationDraftFromEventForm, registrationEventForm, validateRegistrationDraft } from './registrationViewModel.mjs';
import { REGISTRATION_FREQUENCIES, registrationSeriesPlan } from './registrationRecurrence.mjs';
import { getHijriSettings } from '../services/settingsService';

// Private drafts stay in component memory only, never localStorage/IndexedDB.
export default function RegistrationEditor({ initialDraft, initialStep = 'event', hasPoster = false, onRemovePoster, user, profile, templates, templateCursor, onMoreTemplates, busy, onSave, onSaveTemplate, onCancel }) {
  const id = useId();
  const [draft, setDraft] = useState(initialDraft), [step, setStep] = useState(initialStep);
  const [error, setError] = useState(''), [templateName, setTemplateName] = useState('');
  const [calendarSettings, setCalendarSettings] = useState(null);
  const [previewPlaces,setPreviewPlaces] = useState('2');
  const serial = useRef(0), posterRead = useRef(0);
  useEffect(() => () => { posterRead.current++; }, []);
  useEffect(() => {
    let active = true;
    getHijriSettings().then(settings => { if (active) setCalendarSettings(settings.overrides || []); })
      .catch(() => { if (active) setError('Calendar settings could not be loaded. Reopen the editor before creating a recurring event.'); });
    return () => { active = false; };
  }, []);
  const update = (key, value) => setDraft(current => ({ ...current, [key]: value }));
  const change = (id, values) => update('fields', draft.fields.map(field => field.id === id ? { ...field, ...values } : field));
  const choose = template => { setDraft(current => ({ ...current, fields: consentLast(structuredClone(template.fields)), purpose: template.purpose || current.purpose })); setStep('form'); };
  const validation = () => {
    const errors = [...validateRegistrationDraft(draft), ...(!normalisePrivateVenue(draft.venue) ? ['Select a complete address with coordinates for the private map and directions.'] : [])];
    if (draft.frequency === 'recurring') {
      try {
        if (!calendarSettings) throw new Error('Wait for calendar settings before creating a recurring event.');
        registrationSeriesPlan(draft, calendarSettings);
      } catch (problem) { errors.push(problem.message); }
    }
    return errors;
  };
  const readPoster = async e => {
    const file = e.target.files?.[0], request = ++posterRead.current;
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) { setError('Choose a JPEG, PNG or WebP image up to 5 MB.'); return; }
    const reader = new FileReader();
    reader.onload = () => { if (request === posterRead.current) update('poster', { mime: file.type, base64: String(reader.result).split(',')[1], uri: reader.result }); };
    reader.onerror = () => { if (request === posterRead.current) setError('The poster could not be read.'); };
    reader.readAsDataURL(file);
  };
  const notesError = publicNotesError(draft), suburbError = publicSuburbError(draft);
  let seriesPlan = null, seriesError = '';
  if (step === 'preview' && draft.frequency === 'recurring' && calendarSettings) {
    try { seriesPlan = registrationSeriesPlan({ ...draft, occurrenceSettings:{} }, calendarSettings); } catch (problem) { seriesError = problem.message; }
  }
  return <section><div className="registration-actions">{onCancel && <button type="button" disabled={busy} className="btn-light" onClick={onCancel}>Back to event</button>}{step !== 'event' && <button type="button" disabled={busy} className="btn-light" onClick={() => setStep('event')}>Event details</button>}{step === 'preview' && <button type="button" onClick={() => setStep('form')}>Edit form</button>}</div>
    {error && <p role="alert">{error}</p>}<fieldset disabled={busy} className="registration-fields">
      {step === 'event' && <div>
        <EventForm initialEvent={registrationEventForm(draft)} user={user} profile={profile} registrationMode saving={busy} notesMaxLength={NOTES_LIMIT}
          submitLabel="Choose registration form" onSubmit={form => { setDraft(current => registrationDraftFromEventForm(current, form)); setStep('templates'); }}
          registrationSections={{
            title: <label>Event title<input required value={draft.title} maxLength={160} onChange={e => update('title', e.target.value)}/></label>,
            closing: form => {
              const closeError = closingDateError({ ...draft, date:form.eventDate });
              return <label>Registration closes (optional)<input type="datetime-local" value={draft.closes} aria-invalid={Boolean(closeError)} aria-describedby="registration-closing-error" onChange={e => update('closes', e.target.value)}/><small id="registration-closing-error" role={closeError ? 'alert' : undefined}>{closeError || 'Must be an earlier day than the event. Blank closes at the start of event day in the city timezone.'}</small></label>;
            },
            venue: <><p>The full address, coordinates and poster are visible only to registered attendees, the host and authorised administrators. Other users see only the public suburb.</p><label>Public suburb<input value={draft.suburb} maxLength={100} aria-invalid={Boolean(suburbError)} aria-describedby="registration-suburb-error" onChange={e => update('suburb', e.target.value)}/></label><p id="registration-suburb-error" role={suburbError ? 'alert' : undefined}>{suburbError || 'Do not include the street address here.'}</p></>,
            frequency: draft.seriesId ? <p>This is occurrence {draft.occurrenceIndex + 1} of {draft.occurrenceCount}. Changes apply only to this event, not the rest of the series.</p> : <><label htmlFor={id + '-frequency'}>Frequency</label><select id={id + '-frequency'} value={draft.frequency || 'single'} onChange={e => setDraft(current => ({ ...current, frequency:e.target.value, repeatFrequency:current.repeatFrequency || 'week', occurrenceCount:current.occurrenceCount || 4, occurrenceSettings:{} }))}><option value="single">One time</option><option value="recurring">Recurring</option></select>
              {draft.frequency === 'recurring' && <><label htmlFor={id + '-repeat'}>Repeat every</label><select id={id + '-repeat'} value={draft.repeatFrequency || 'week'} onChange={e => setDraft(current => ({ ...current, repeatFrequency:e.target.value, occurrenceCount:e.target.value === 'year' ? Math.min(5, Number(current.occurrenceCount) || 4) : current.occurrenceCount, occurrenceSettings:{} }))}>{REGISTRATION_FREQUENCIES.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select><label>Number of occurrences<input type="number" min="2" max={draft.repeatFrequency === 'year' ? 5 : 100} value={draft.occurrenceCount || ''} onChange={e => update('occurrenceCount', e.target.value)}/></label><p>Each occurrence has separate registration, capacity, closing time and approval. Review its dates and settings before saving. Recurrence follows your selected Gregorian or Hijri calendar.</p></>}</>,
            settings: <><label>Capacity (places)<input type="number" min="1" max="10000" value={draft.capacity} onChange={e => update('capacity', e.target.value)}/></label><label className="registration-check"><input type="checkbox" checked={draft.allowCancellation} onChange={e => update('allowCancellation', e.target.checked)}/>Allow attendee cancellation before event day</label></>,
          }}
          posterControls={<EventPosterPicker uri={draft.poster?.uri} hasPoster={hasPoster} privatePoster disabled={busy} onChange={readPoster} onRemove={draft.poster ? () => { posterRead.current++; update('poster', null); } : onRemovePoster} />}/>

        {notesError && <p role="alert">{notesError}</p>}
      </div>}
      {step === 'templates' && <div className="card"><h2>Use a template or build your own?</h2><p>Templates can be customised.</p><div className="registration-actions">{FORM_TEMPLATES.map(template => <button type="button" key={template.name} onClick={() => choose({ fields: templateFields(template) })}>{template.name}</button>)}{templates.map(template => <button type="button" key={template.id} onClick={() => choose(template)}>{template.name} (saved)</button>)}{templateCursor && <button type="button" onClick={onMoreTemplates}>Load more templates</button>}<button type="button" onClick={() => choose({ fields: [] })}>Build my own form</button><button type="button" onClick={() => setStep('form')}>Continue current form</button></div></div>}
      {step === 'form' && <><p>Mark questions such as full name, age or school year as Per participant. Keep booking contact details and agreement once per booking.</p><div className="card"><label>Why are you collecting these answers?<textarea value={draft.purpose} maxLength={1000} onChange={e => update('purpose', e.target.value)}/></label></div>
        {draft.fields.map((field, index) => <section className="card" key={field.id}><h3>Question {index + 1} · {FIELD_TYPES.find(([type]) => type === field.type)?.[1]}</h3>
          <label>Question<input value={field.label} maxLength={200} onChange={e => change(field.id, { label: e.target.value })}/></label><label>Help text<input value={field.description || ''} maxLength={500} onChange={e => change(field.id, { description: e.target.value })}/></label>
          {['select', 'radio', 'checkboxes'].includes(field.type) && <label>Options — one per line<textarea value={field.options.join('\n')} onChange={e => change(field.id, { options: e.target.value.split('\n') })}/></label>}
          {field.type === 'consent' && <label>Your terms and conditions<textarea value={field.terms || ''} maxLength={TERMS_LIMIT} onChange={e => change(field.id, { terms: e.target.value })}/><small>Write the terms attendees must agree to. Agreement fields stay last.</small></label>}
          {field.type !== 'consent' && <label className="registration-check"><input type="checkbox" checked={Boolean(field.perParticipant)} onChange={e => change(field.id, {perParticipant:e.target.checked})}/>Per participant — repeat for each place</label>}
          <label className="registration-check"><input type="checkbox" checked={field.required} disabled={field.type === 'consent'} onChange={e => change(field.id, { required: e.target.checked })}/>Required</label>
          <div className="registration-actions"><button type="button" disabled={index === 0} onClick={() => update('fields', moveField(draft.fields, index, -1))} aria-label="Move up" title="Move up"><ArrowUp size={18} aria-hidden="true"/></button><button type="button" disabled={index === draft.fields.length - 1} onClick={() => update('fields', moveField(draft.fields, index, 1))} aria-label="Move down" title="Move down"><ArrowDown size={18} aria-hidden="true"/></button><button type="button" onClick={() => update('fields', draft.fields.filter(row => row.id !== field.id))} aria-label="Remove question" title="Remove question"><Trash2 size={18} aria-hidden="true"/></button></div>
        </section>)}
        <div className="card"><h3>Add a question</h3><div className="registration-actions">{FIELD_TYPES.map(([type, label]) => <button type="button" key={type} disabled={draft.fields.length >= 30} onClick={() => update('fields', consentLast([...draft.fields, makeField(type, `q-${Date.now()}-${++serial.current}`)]))}>{label}</button>)}</div></div>
        <div className="card"><label>Save reusable template as<input value={templateName} maxLength={80} onChange={e => setTemplateName(e.target.value)}/></label><button type="button" disabled={!templateName.trim()} onClick={() => onSaveTemplate({ name: templateName, fields: draft.fields, purpose: draft.purpose })}>Save template without venue or answers</button></div>
        <button type="button" onClick={() => { const errors = validation(); setError(errors.join(' ')); if (!errors.length) setStep('preview'); }}>Preview attendee form</button>
      </>}
      {step === 'preview' && <section className="card">
        {seriesError && <p role="alert">{seriesError}</p>}
        {seriesPlan && <section aria-label="Recurring registration event preview"><h2>Review {seriesPlan.occurrences.length} occurrences</h2><p>Capacity and registration closing time apply separately to each event. Change the first occurrence in Event details.</p>
          {seriesPlan.occurrences.map((row,index) => <details key={row.date}><summary>{index + 1}. {row.date}{row.enteredAsHijri ? ` · ${row.hijriDate}` : ''} · {row.startTime || 'Time not provided'} · {draft.occurrenceSettings?.[row.date]?.capacity ?? row.capacity} places</summary>
            {index === 0 ? <p>Registration closes: {row.closes || 'Start of event day'}</p> : <div className="row"><label>Capacity for {row.date}<input type="number" min="1" max="10000" value={draft.occurrenceSettings?.[row.date]?.capacity ?? row.capacity} onChange={e => setDraft(current => ({ ...current, occurrenceSettings:{ ...current.occurrenceSettings, [row.date]:{ ...current.occurrenceSettings?.[row.date], capacity:e.target.value } } }))}/></label><label>Registration closes for {row.date}<input type="datetime-local" value={draft.occurrenceSettings?.[row.date]?.closes ?? row.closes} onChange={e => setDraft(current => ({ ...current, occurrenceSettings:{ ...current.occurrenceSettings, [row.date]:{ ...current.occurrenceSettings?.[row.date], closes:e.target.value } } }))}/></label></div>}
          </details>)}</section>}
        <h2>Attendee form preview</h2><p>{draft.purpose}</p><label>Preview number of participants<select value={previewPlaces} onChange={event => setPreviewPlaces(event.target.value)}>{[1,2,3,4,5].map(count => <option key={count}>{count}</option>)}</select></label><fieldset disabled>{registrationFieldGroups(draft.fields,previewPlaces).map(group => <section className="registration-participant-group" key={group.id}><h3>{group.label}</h3>{group.fields.map(field => <AnswerField key={field.id} field={{...field,label:field.originalLabel || field.label}} onChange={() => {}}/>)}</section>)}</fieldset><p>New events and submitted changes need administrator approval. The last approved version stays published while changes are reviewed. Approved form changes may require attendees to review their answers.</p><button type="button" onClick={() => { const errors = validation(); setError(errors.join(' ')); if (!errors.length) onSave(draft, registrationSeriesPlan(draft, calendarSettings || [])); }}>Save event and registration form</button></section>}
    </fieldset>
  </section>;
}
