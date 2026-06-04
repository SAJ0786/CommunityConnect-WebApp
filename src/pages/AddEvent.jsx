import EventForm from '../components/EventForm';
import { createEvent } from '../services/eventService';

export default function AddEvent({ user, profile, onSaved, setPage, events = [], initialEvent = null }) {
  const submit = async event => {
    try {
      await createEvent(event, user, profile);
      onSaved();
    } catch (e) {
      alert('Error saving event: ' + e.message);
    }
  };
  return (
    <EventForm
      initialEvent={initialEvent}
      onSubmit={submit}
      onCancel={() => setPage('home')}
      user={user}
      profile={profile}
      existingEvents={events}
    />
  );
}
