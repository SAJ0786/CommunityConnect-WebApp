import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { sendHostMessage } from '../services/hostMessagingService';
import { useDialogFocus } from '../utils/useDialogFocus';
export default function ContactHostDialog({ event, onClose }) {
  const dialog = useRef(null), pending = useRef(false);
  const [text, setText] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [sent, setSent] = useState(false);
  const close = () => { if (!pending.current && (!text || sent || window.confirm('Discard your unsent message?'))) onClose(); };
  useDialogFocus(dialog, true, close);
  async function submit(e) {
    e.preventDefault(); if (pending.current || !text.trim()) return;
    pending.current = true; setBusy(true); setError('');
    try { await sendHostMessage(event.id, text); setText(''); setSent(true); }
    catch (problem) { setError(problem.message + ' Check Host Inbox before retrying if the connection was interrupted.'); }
    finally { pending.current = false; setBusy(false); }
  }
  return createPortal(<div className="event-series-backdrop" onClick={e => e.stopPropagation()}>
    <section className="event-series-dialog" role="dialog" aria-modal="true" aria-labelledby="contact-host-title" ref={dialog} tabIndex={-1}>
      <h2 id="contact-host-title">Contact Host</h2><p>{event.eventTypeDisplay || event.eventType} · {event.hostName}</p>
      {sent ? <p role="status">Message sent. Continue the private conversation in Host Inbox from the menu.</p>
        : <form onSubmit={submit}><label>Your message<textarea value={text} onChange={e => setText(e.target.value)} maxLength={2000} rows={5} disabled={busy} required /></label>
          <p className="small">Only you and the host can read this conversation.</p><button disabled={busy || !text.trim()}>{busy ? 'Sending…' : 'Send message'}</button></form>}
      {error && <p role="alert">{error}</p>}<button className="btn-light" disabled={busy} onClick={close}>{sent ? 'Close' : 'Cancel'}</button>
    </section></div>, document.body);
}
