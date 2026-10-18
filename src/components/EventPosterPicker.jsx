import React, { useId, useRef } from 'react';
import { Camera, Upload, X } from 'lucide-react';
import '../styles/event-poster.css';

export default function EventPosterPicker({ uri, hasPoster = false, onChange, onRemove, privatePoster = false, disabled = false }) {
  const id = useId(), input = useRef(null);
  return <section className="event-poster-control" aria-label="Event poster">
    <label htmlFor={id}>Upload Event Poster <small>(optional)</small></label>
    <button type="button" className="event-poster-drop" onClick={() => input.current?.click()} disabled={disabled} aria-label="Choose event poster">
      {uri ? <img src={uri} alt="Selected event poster"/> : <><Camera aria-hidden="true"/><strong>{hasPoster ? 'Event poster saved' : 'Tap to add event poster'}</strong><span>Choose a clear image from your device</span></>}
    </button>
    <input ref={input} id={id} type="file" accept={privatePoster ? 'image/jpeg,image/png,image/webp' : 'image/*'} disabled={disabled} onChange={event => { onChange(event); event.target.value = ''; }} hidden />
    <div className="event-poster-actions"><button className="btn-light" type="button" disabled={disabled} onClick={() => input.current?.click()}><Upload size={18} aria-hidden="true"/>{uri || hasPoster ? 'Choose another photo' : 'Upload your event poster'}</button>
      {(uri || hasPoster) && onRemove && <button className="btn-light" type="button" disabled={disabled} onClick={onRemove}><X size={18} aria-hidden="true"/>Remove poster</button>}</div>
    <small>{privatePoster ? 'Visible only to registered attendees, the organiser and authorised admins. JPEG, PNG or WebP, up to 5 MB.' : 'Optional — your organisation logo is used when no poster is uploaded.'}</small>
  </section>;
}
