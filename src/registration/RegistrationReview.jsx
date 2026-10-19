import React from 'react';
import './workspace.css';

export default function RegistrationReview({ detail, poster, busy, onPoster }) {
  const { event, form, privateDetails } = detail;
  const values = [
    ['Event type', event.eventType], ['Date', event.date], ['Start time', event.startTime || 'Date only'], ['End time', event.endTime || 'Not supplied'],
    ['City', event.city], ['Public suburb', event.suburb], ['Host', event.hostName], ['Organiser', event.organiserName], ['Subject', event.eventSubject], ['Audience', event.audienceType], ['Speaker', event.speakerName],
    ['Notes', event.notes], ['Capacity', event.capacity], ['Registration closes', event.closes || 'Start of event day'],
    ['Full address (private)', privateDetails?.address], ['Host phone (private)', privateDetails?.hostPhone], ['Host contact (private)', privateDetails?.hostContactOptional],
  ];
  return <section className="registration-review" aria-label="Submitted event details">
    {detail.pendingChanges && <p>Submitted changes await approval. The last approved version remains published.</p>}
    <h3>{event.title}</h3>
    {event.seriesId && Number.isInteger(event.occurrenceIndex) && Number.isInteger(event.occurrenceCount) && <p>Occurrence {event.occurrenceIndex + 1} of {event.occurrenceCount}</p>}
    <dl className="registration-review-grid">{values.filter(([,value]) => value !== undefined && value !== '').map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{String(value)}</dd></div>)}</dl>
    {event.reciters?.map((row, index) => <div className="registration-form-field" key={index}><strong>{row.customType || row.type}</strong><p>{row.name}</p></div>)}
    {privateDetails?.hasPoster && <button className="btn-light" type="button" disabled={busy} onClick={onPoster}>View submitted poster</button>}
    {poster && <img className="registration-poster" src={poster} alt="Submitted event poster"/>}
    <h3>Registration form</h3><p>{form?.purpose}</p>
    {form?.fields?.map(field => <section className="registration-form-field" key={field.id}><h4>{field.label}{field.required ? ' *' : ''}</h4>{field.perParticipant && <small>Repeated for each participant (up to five)</small>}<p>{field.description}</p><p>{field.terms || field.options?.join(', ')}</p></section>)}
  </section>;
}
