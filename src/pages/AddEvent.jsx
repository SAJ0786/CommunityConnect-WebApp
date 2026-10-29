import { useEffect, useRef, useState } from 'react';
import EventForm from '../components/EventForm';
import AddRecurringEvent from './AddRecurringEvent';
import { createEvent } from '../services/eventService';
import { REGISTRATION_ENABLED } from '../config/releaseGates.mjs';
import { isAdminRole } from '../utils/permissions';
import '../styles/add-event.css';

export default function AddEvent({ user, profile, onSaved, setPage, events = [], initialEvent = null }) {
  const [mode, setMode] = useState(initialEvent ? 'single' : '');
  const [saving, setSaving] = useState(false);
  const pending = useRef(false), committed = useRef(false);
  const [saved, setSaved] = useState(false);
  const canCreateRecurring = isAdminRole(profile?.role);

  useEffect(() => {
    window.__communityAddEventBack = () => {
      if (!initialEvent && mode) {
        setMode('');
        return true;
      }
      return false;
    };
    return () => {
      if (window.__communityAddEventBack) delete window.__communityAddEventBack;
    };
  }, [initialEvent, mode]);

  const submit = async event => {
    if (pending.current || committed.current) return;
    pending.current = true; setSaving(true);
    try {
      await createEvent(event, user, profile);
      committed.current = true; setSaved(true);
    } catch (e) {
      alert('Error saving event: ' + e.message);
    } finally { pending.current = false; setSaving(false); }
    if (committed.current) {
      try { await onSaved?.('Event added successfully.'); }
      catch (error) { console.error('Event saved; could not return to Home:', error); }
    }
  };
  if (saved) return <div className="card" role="status"><h2>Event added successfully</h2><p>Your event has been saved. You do not need to submit it again.</p><button onClick={() => setPage('home')}>Back to Home</button></div>;

  if (!mode) {
    return (
      <div className="card" style={{ maxWidth: 760, margin: '18px auto' }}>
        <p className="small" style={{ color: 'var(--muted)', margin: '0 0 16px' }}>
          Choose how this event should be created.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          <button type="button" className="add-event-choice" onClick={() => setMode('single')}>
            <span className="add-event-choice-icon" aria-hidden="true">📅</span>
            <strong>Single Event</strong>
            <span>Create one event for one date and time.</span>
          </button>
          <button type="button" className="add-event-choice" disabled={!canCreateRecurring}
            onClick={() => canCreateRecurring && setMode('recurring')}
            title={canCreateRecurring ? 'Create repeating events' : 'Recurring events are available to admins only'}>
            <span className="add-event-choice-icon" aria-hidden="true">🔁</span>
            <strong>Recurring Event</strong>
            <span>Repeat by day, week, month or year with a preview before saving.</span>
            {!canCreateRecurring && <em>Admin only</em>}
          </button>
          {REGISTRATION_ENABLED && <button type="button" className="add-event-choice" onClick={() => setPage('registration-create')}>
            <span className="add-event-choice-icon" aria-hidden="true">📋</span>
            <strong>Registration only event</strong>
            <span>For events where people must register to attend. Build a registration form, set a closing time and manage attendees. The full address and poster are shown only to registered attendees. Admin approval is required before it appears publicly.</span>
          </button>}
        </div>
      </div>
    );
  }

  if (mode === 'recurring') {
    return <AddRecurringEvent user={user} profile={profile} setPage={setPage} onSaved={onSaved} />;
  }

  return (
    <EventForm
      initialEvent={initialEvent}
      onSubmit={submit}
      onCancel={() => setPage('home')}
      user={user}
      profile={profile}
      existingEvents={events}
      saving={saving}
    />
  );
}
