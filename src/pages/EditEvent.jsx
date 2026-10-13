import { useRef, useState } from 'react';
import EventForm from '../components/EventForm';
import EventSeriesSchedule from '../components/EventSeriesSchedule';
import { updateEvent } from '../services/eventService';
import { saveFutureSeriesEdit } from '../services/eventSeriesEditService';
export default function EditEvent({ editingEvent, onSaved, user, profile, events = [] }) {
  const [saving, setSaving] = useState(false), [error, setError] = useState(''), pending = useRef(false);
  const [schedule, setSchedule] = useState({schedule:null,error:''});
  if (!editingEvent) return <div className="card">No event selected.</div>;
  async function submit(event) {
    if (pending.current) return; pending.current = true; setSaving(true); setError('');
    try {
      if (import.meta.env.VITE_READ_ONLY_PREVIEW === 'true') throw new Error('Disabled in the read-only preview.');
      if (editingEvent.__editSeries && schedule.error) throw new Error(schedule.error);
      const count = editingEvent.__editSeries ? await saveFutureSeriesEdit(editingEvent, event, schedule.schedule) : (await updateEvent(editingEvent.id, event), 1);
      window.showToast?.(editingEvent.__editSeries ? count + ' future occurrences updated.' : 'Event updated.', 'success');
      onSaved();
    } catch (problem) { setError(problem.message); }
    finally { pending.current = false; setSaving(false); }
  }
  return <>
    {editingEvent.__editSeries && <section className="card"><h2>Edit Series</h2><p>Update shared details for {editingEvent.__futureIds?.length || 0} future occurrences. Keep the dates or review a new schedule below.</p>
      <details><summary>Review affected occurrences</summary><ul>{editingEvent.__futureOccurrences?.map(row => <li key={row.id}>{row.eventDate} · {row.startTime} · {row.hostName}</li>)}</ul></details></section>}
    {editingEvent.__editSeries && <EventSeriesSchedule key={editingEvent.id} source={editingEvent} onChange={setSchedule} disabled={saving}/>}
    {error && <p className="card" role="alert">{error}</p>}
    <EventForm key={editingEvent.id + '-' + Boolean(editingEvent.__editSeries)} initialEvent={editingEvent}
      onSubmit={submit} user={user} profile={profile} existingEvents={events} saving={saving}
      seriesMode={!!editingEvent.__editSeries} submitLabel={editingEvent.__editSeries ? 'Update Future Occurrences' : 'Update Event'} />
  </>;
}
