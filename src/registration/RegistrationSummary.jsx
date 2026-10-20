import React from 'react';
import { CalendarDays, Clock, MapPin, TicketCheck } from 'lucide-react';
export default function RegistrationSummary({event, places}) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(event.date || '') ? new Date(event.date+'T12:00:00Z') : null;
  const dateText = date ? new Intl.DateTimeFormat('en-AU',{weekday:'short',day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(date) : event.date;
  return <header className="registration-event-heading"><div className="registration-event-identity"><img src="/icons/icon-192.png" alt=""/><div><span className="registration-kind">Registration only event</span><h2>{event.title}</h2><p>{event.eventType}</p></div></div><div className="registration-event-meta"><span><CalendarDays aria-hidden="true" size={17}/>{dateText}</span><span><Clock aria-hidden="true" size={17}/>{event.startTime || 'Time to be confirmed'}{event.endTime ? ` – ${event.endTime}` : ''}</span><span><MapPin aria-hidden="true" size={17}/>{event.suburb}</span></div>{places > 0 && <p className="registration-booked"><TicketCheck aria-hidden="true" size={18}/>{places} {places === 1 ? 'place' : 'places'} registered</p>}</header>;
}
