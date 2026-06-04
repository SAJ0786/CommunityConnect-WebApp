import EventForm from '../components/EventForm';
import { updateEvent } from '../services/eventService';

export default function EditEvent({ editingEvent, onSaved, user, profile, events = [] }) {
  if (!editingEvent) return <div className="card">No event selected.</div>;
  const submit = async event => {
    try {
      await updateEvent(editingEvent.id, event);
      window.showToast('Event updated successfully.', 'success');
      onSaved();
    } catch (e) {
      window.showToast('Error updating event: ' + e.message, 'error');
    }
  };
  return (
    <EventForm
      initialEvent={editingEvent}
      onSubmit={submit}
      submitLabel="Update Event"
      user={user}
      profile={profile}
      existingEvents={events}
    />
  );
}
