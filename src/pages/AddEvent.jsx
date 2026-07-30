import { useEffect, useState } from 'react';
import EventForm from '../components/EventForm';
import AddRecurringEvent from './AddRecurringEvent';
import { createEvent } from '../services/eventService';
import { isAdminRole } from '../utils/permissions';

export default function AddEvent({ user, profile, onSaved, setPage, events = [], initialEvent = null }) {
  const [mode, setMode] = useState(initialEvent ? 'single' : '');
  const [saving, setSaving] = useState(false);
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
    if (saving) return;
    setSaving(true);
    try {
      await createEvent(event, user, profile);
      await onSaved('Event added successfully.');
    } catch (e) {
      alert('Error saving event: ' + e.message);
      setSaving(false);
    }
  };

  if (!mode) {
    return (
      <div className="card" style={{ maxWidth: 760, margin: '18px auto' }}>
        <h2 style={{ margin: '0 0 6px' }}>Add Event</h2>
        <p className="small" style={{ color: 'var(--muted)', margin: '0 0 16px' }}>
          Choose how this event should be created.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          <button type="button" onClick={() => setMode('single')}
            style={{
              textAlign: 'left',
              background: 'white',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              borderRadius: 14,
              padding: 16,
              boxShadow: 'var(--shadow-sm)',
            }}>
            <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>📅</div>
            <div style={{ fontWeight: 900, marginBottom: 4 }}>Single Event</div>
            <div className="small" style={{ color: 'var(--muted)' }}>Create one event for one date and time.</div>
          </button>
          <button type="button" disabled={!canCreateRecurring}
            onClick={() => canCreateRecurring && setMode('recurring')}
            title={canCreateRecurring ? 'Create repeating events' : 'Recurring events are available to admins only'}
            style={{
              textAlign: 'left',
              background: canCreateRecurring ? 'white' : '#f3f4f6',
              color: canCreateRecurring ? 'var(--text)' : '#9ca3af',
              border: '1px solid var(--border)',
              borderRadius: 14,
              padding: 16,
              boxShadow: 'var(--shadow-sm)',
              opacity: canCreateRecurring ? 1 : 0.7,
              cursor: canCreateRecurring ? 'pointer' : 'not-allowed',
            }}>
            <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>🔁</div>
            <div style={{ fontWeight: 900, marginBottom: 4 }}>Recurring Event</div>
            <div className="small" style={{ color: canCreateRecurring ? 'var(--muted)' : '#9ca3af' }}>
              Repeat by day, week, month or year with a preview before saving.
            </div>
            {!canCreateRecurring && (
              <div className="small" style={{ marginTop: 8, fontWeight: 800 }}>Admin only</div>
            )}
          </button>
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
