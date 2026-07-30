import EventForm from '../components/EventForm';
import { updateEvent } from '../services/eventService';
import { collection, getDocs, query, serverTimestamp, where, writeBatch } from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { classifyMetroArea } from '../utils/cities';

async function updateEventSeries(sourceEvent, event) {
  if (!sourceEvent.seriesId) throw new Error('Identify this older series before editing it.');
  const protectedFields = new Set([
    'id', '__editSeries', 'eventDate', 'hijriDate', 'hijriDay', 'hijriMonth',
    'hijriYear', 'enteredAsHijri', 'seriesId', 'recurringSeriesId', 'isRecurring',
    'recurrenceIndex', 'recurrenceTotal', 'recurrenceRuleSnapshot',
    'seriesStartDate', 'seriesEndDate',
    'createdAt', 'createdByUserId', 'createdByUserEmail', 'createdByName',
    'isLive', 'liveUrl', 'liveWatchUrl', 'liveRoomCode', 'liveStartedAt', 'liveEndedAt'
  ]);
  const updates = {
    ...Object.fromEntries(Object.entries(event).filter(([key]) => !protectedFields.has(key))),
    metroArea: classifyMetroArea(event.address),
  };
  const snap = await getDocs(query(collection(db, 'events'), where('seriesId', '==', sourceEvent.seriesId)));
  if (snap.empty) throw new Error('No matching series events were found.');
  for (let offset = 0; offset < snap.docs.length; offset += 450) {
    const batch = writeBatch(db);
    snap.docs.slice(offset, offset + 450).forEach(item => {
      batch.update(item.ref, { ...updates, updatedAt: serverTimestamp() });
    });
    await batch.commit();
  }
  return snap.docs.length;
}

export default function EditEvent({ editingEvent, onSaved, user, profile, events = [] }) {
  if (!editingEvent) return <div className="card">No event selected.</div>;
  const submit = async event => {
    try {
      if (editingEvent.__editSeries) {
        const count = await updateEventSeries(editingEvent, event);
        window.showToast(`${count} events in the series updated successfully.`, 'success');
      } else {
        await updateEvent(editingEvent.id, event);
        window.showToast('Event updated successfully.', 'success');
      }
      onSaved();
    } catch (e) {
      window.showToast('Error updating event: ' + e.message, 'error');
    }
  };
  return (
    <EventForm
      initialEvent={editingEvent}
      onSubmit={submit}
      user={user}
      profile={profile}
      existingEvents={events}
      seriesMode={!!editingEvent.__editSeries}
      submitLabel={editingEvent.__editSeries ? 'Update Entire Series' : 'Update Event'}
    />
  );
}
