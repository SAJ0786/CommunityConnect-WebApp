import React from 'react';
import './workspace.css';

export default function RegistrationReview({ detail, poster, busy, onPoster }) {
  const { event, form, privateDetails } = detail;
  return <section aria-label="Submitted event details">
    {detail.pendingChanges && <p>These are the submitted changes. The last approved version remains published until approval.</p>}
    <h3>{event.title}</h3>
    <p>{event.eventType} · {event.date} · {event.startTime || 'Time not provided'}{event.endTime ? ` - ${event.endTime}${event.endTime < event.startTime ? ' (following day)' : ''}` : ''} · {event.suburb}</p>
    {event.hostName && <p>Host: {event.hostName}</p>}
    {event.organiserName && <p>Organiser: {event.organiserName}</p>}
    {event.eventSubject && <p>Subject: {event.eventSubject}</p>}
    {event.audienceType && <p>Audience: {event.audienceType}</p>}
    {event.speakerName && <p>Speaker: {event.speakerName}</p>}
    {event.reciters?.map((row, index) => <p key={index}>{row.customType || row.type}: {row.name}</p>)}
    <p>{event.notes}</p>
    <p>Capacity: {event.capacity} · Registration closes: {event.closes || 'Start of event day'}</p>
    <p>{privateDetails?.address}</p>
    {privateDetails?.hostPhone && <p>Host phone: {privateDetails.hostPhone}</p>}
    {privateDetails?.hostContactOptional && <p>Host contact: {privateDetails.hostContactOptional}</p>}
    {privateDetails?.hasPoster && <button type="button" disabled={busy} onClick={onPoster}>View submitted poster</button>}
    {poster && <img className="registration-poster" src={poster} alt="Submitted event poster"/>}
    <p>{form?.purpose}</p>
    {form?.fields?.map(field => <section key={field.id}><h4>{field.label}{field.required ? ' *' : ''}</h4>
      <p>{field.description}</p><p>{field.terms || field.options?.join(', ')}</p></section>)}
  </section>;
}
