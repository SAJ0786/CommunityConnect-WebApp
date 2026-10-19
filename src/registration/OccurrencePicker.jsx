import React from 'react';
import { availableOccurrences } from './occurrenceSelection.mjs';
export default function OccurrencePicker({detail,places,selected,onChange,disabled}) {
  if (!detail.occurrences?.length) return null;
  const eligible=availableOccurrences(detail,places), all=eligible.length>0 && selected.length===eligible.length && eligible.every(row=>selected.includes(row.eventId));
  return <fieldset className="registration-occurrences" disabled={disabled}><legend>Choose occurrences</legend>
    <p>The participant details and number of places below apply to every selected date. Existing bookings on other dates stay unchanged.</p>
    <label className="registration-check"><input type="checkbox" checked={all} disabled={!eligible.length} onChange={()=>onChange(all ? [] : eligible.map(row=>row.eventId))}/>Select all available occurrences</label>
    {detail.occurrences.map(row=>{const checked=selected.includes(row.eventId),available=eligible.some(item=>item.eventId===row.eventId);return <label className="registration-check" key={row.eventId}><input type="checkbox" checked={checked} disabled={!available && !checked} onChange={()=>onChange(checked ? selected.filter(id=>id!==row.eventId) : [...selected,row.eventId])}/><span>{row.date}{row.startTime ? ` · ${row.startTime}` : ''}{!available ? ` — ${row.reason || 'Not enough places'}` : ` · ${row.availablePlaces} places available`}</span></label>;})}
    <p role="status">{selected.length} {selected.length===1 ? 'occurrence' : 'occurrences'} selected</p>
  </fieldset>;
}
