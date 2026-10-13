import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getEventReminder, setEventReminder, removeEventReminder } from '../services/eventReminderService';
import { useDialogFocus } from '../utils/useDialogFocus';
const options = [[15,'15 minutes before'],[30,'30 minutes before'],[60,'1 hour before'],[180,'3 hours before'],[1440,'1 day before']];
export default function EventReminderDialog({ event, onClose }) {
  const dialog = useRef(null), pending = useRef(false);
  const [reminder,setReminder] = useState(null), [busy,setBusy] = useState(true), [error,setError] = useState(''), [status,setStatus] = useState(''), [ready,setReady] = useState(false);
  useDialogFocus(dialog, true, () => { if (!pending.current) onClose(); });
  useEffect(() => {
    let active = true;
    getEventReminder(event.id).then(value => { if (active) { setReminder(value); setReady(true); } }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [event.id]);
  async function change(minutes) {
    if (pending.current) return; pending.current = true; setBusy(true); setError(''); setStatus('');
    try {
      if (minutes === null) { await removeEventReminder(event.id); setReminder(null); setStatus('Reminder removed.'); }
      else { setReminder(await setEventReminder(event.id, minutes)); setStatus('Reminder saved for this browser.'); }
    } catch (problem) { setError(problem.message); }
    finally { pending.current = false; setBusy(false); }
  }
  return createPortal(<div className="event-series-backdrop" onClick={e=>e.stopPropagation()}>
    <section className="event-series-dialog" ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="event-reminder-title">
      <h2 id="event-reminder-title">Reminder</h2><p>{event.eventTypeDisplay || event.eventType} · {event.hostName}</p>
      <p>Choose when this browser should notify you. Allow notifications to receive reminders after this tab closes. Delivery depends on your device, browser and connection.</p>
      {busy && <p role="status">Please wait…</p>}{error && <p role="alert">{error}</p>}{status && <p role="status">{status}</p>}
      {reminder && <p>Current status: {reminder.status === 'sent' ? 'Sent to notification service' : reminder.status === 'delivery-unconfirmed' || reminder.status === 'dispatching' ? 'Delivery could not be confirmed; check notifications before setting another reminder' : reminder.status}{reminder.fireAt ? ' · ' + new Date(reminder.fireAt).toLocaleString('en-AU') : ''}</p>}
      {ready && options.map(([minutes,label])=><button className="btn-light" key={minutes} disabled={busy} aria-pressed={reminder?.status === 'pending' && reminder.minutesBefore === minutes} onClick={()=>change(minutes)}>{label}</button>)}
      {ready && reminder && reminder.status === 'pending' && <button disabled={busy} onClick={()=>change(null)}>Remove Reminder</button>}
      <button className="btn-light" disabled={pending.current} onClick={onClose}>Close</button>
    </section></div>, document.body);
}
