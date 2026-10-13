import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { prepareEventSeriesArchive, confirmEventSeriesArchive } from '../services/eventSeriesService';
import { useDialogFocus } from '../utils/useDialogFocus';

export default function EventSeriesArchiveDialog({ event, onClose }) {
  const [preview, setPreview] = useState(null), [error, setError] = useState(''), [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false), [result, setResult] = useState(null);
  const dialog = useRef(null), inFlight = useRef(false), generation = useRef(0);
  const close = () => { if (!inFlight.current) onClose(); };
  useDialogFocus(dialog, true, close);
  async function load() {
    const current = ++generation.current;
    setLoading(true); setError(''); setPreview(null);
    try { const value = await prepareEventSeriesArchive(event); if (current === generation.current) setPreview(value); }
    catch (problem) { if (current === generation.current) setError(problem.message); }
    finally { if (current === generation.current) setLoading(false); }
  }
  useEffect(() => { load(); return () => { generation.current++; }; }, [event.id, event.seriesId, event.recurringSeriesId]);
  const confirm = async () => {
    if (inFlight.current || !preview) return;
    inFlight.current = true; setBusy(true); setError('');
    try { setResult(await confirmEventSeriesArchive(preview)); }
    catch (problem) {
      setError(problem.message + ' Refresh the selection to check the current state before another attempt.');
      setPreview(null);
    } finally { inFlight.current = false; setBusy(false); }
  };
  return createPortal(<div className="event-series-backdrop" onClick={click => click.stopPropagation()}>
    <section ref={dialog} role="dialog" aria-modal="true" aria-labelledby="event-series-title" tabIndex={-1} className="event-series-dialog">
      <h2 id="event-series-title">Delete Series</h2>
      {loading && <p role="status">Checking future occurrences…</p>}
      {error && <p role="alert" className="error">{error}</p>}
      {result ? <>
        <p role="status">{result.archived} future {result.archived === 1 ? 'event archived' : 'events archived'}.{result.remaining > 0 ? ` ${result.remaining} selected occurrences were not archived; their state changed before processing.` : ''}</p>
        <p>Past events and live events are preserved. Reload Events to see the latest list.</p>
        <button onClick={() => window.location.reload()}>Reload Events</button>
      </> : preview && <>
        <p>Archive {preview.events.length} future {preview.events.length === 1 ? 'occurrence' : 'occurrences'}? Past and live events are preserved. Archived records retain their history.</p>
        <ul>{preview.events.map(item => <li key={item.id}>{item.eventDate} · {item.startTime || 'Time not supplied'} · {item.hostName || item.eventTypeDisplay || item.eventType || 'Event'}</li>)}</ul>
        <button disabled={busy} onClick={confirm}>{busy ? 'Archiving…' : 'Archive future events'}</button>
      </>}
      {!loading && !preview && !result && <button disabled={busy} onClick={load}>Refresh selection</button>}
      <button className="btn-light" disabled={busy} onClick={close}>{result ? 'Close' : 'Cancel'}</button>
    </section>
  </div>, document.body);
}
