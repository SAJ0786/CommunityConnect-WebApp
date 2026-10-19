import React, { useState, useEffect } from 'react';
import EventCard from '../components/EventCard';
import { ClipboardList } from 'lucide-react';
import { getMyEvents, toggleEventVisibility } from '../services/eventService';
import { useRegistration, useRegistrationFeed } from '../registration/RegistrationContext';
import { compareEventsByDateTime } from '../services/dateUtils';

export default function MyEvents({ user, profile, setPage, setEditingEvent, handleDelete, handleCopy, onStreamStart, savedIds = [], onSaveToggle }) {
  const [myEvents,  setMyEvents]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const registration = useRegistration();
  const hosted = useRegistrationFeed(registration?.api, 'mine', undefined, registration?.revision);
  const attending = useRegistrationFeed(registration?.api, 'attending', undefined, registration?.revision);
  const allEvents = [...new Map([...myEvents, ...attending.events, ...hosted.events].map(event => [event.id, event])).values()].sort(compareEventsByDateTime);

  useEffect(() => {
    if (!user?.uid) return;
    setLoading(true);
    getMyEvents(user.uid)
      .then(setMyEvents)
      .catch(() => setMyEvents([]))
      .finally(() => setLoading(false));
  }, [user?.uid]);

  const handleToggle = async (event) => {
    const newHidden = !event.hidden;
    try {
      await toggleEventVisibility(event.id, newHidden);
      setMyEvents(prev => prev.map(e =>
        e.id === event.id ? { ...e, hidden: newHidden } : e
      ));
      if (window.showToast) window.showToast(
        newHidden ? '🙈 Event hidden from home screen' : '👁 Event visible on home screen',
        'success'
      );
    } catch(e) {
      if (window.showToast) window.showToast('Error: ' + e.message, 'error');
    }
  };

  const handleMyDelete = async (id) => {
    await handleDelete(id);
    setMyEvents(prev => prev.filter(e => e.id !== id));
  };

  return (
    <>
      {loading && (
        <div className="card center">
          <p style={{ color: 'var(--muted)' }}>Loading your events…</p>
        </div>
      )}

      {(hosted.error || attending.error) && <div className="card" role="alert">{hosted.error || attending.error}<button onClick={() => registration.refresh()}>Retry registration events</button></div>}
      {(hosted.loading || attending.loading) && <p role="status">Loading your registration events...</p>}
      {!loading && !hosted.loading && !attending.loading && allEvents.length === 0 && (
        <div className="card center">
          <p style={{ color: 'var(--muted)', marginBottom: 12 }}>You haven't added any events yet.</p>
          <button onClick={() => setPage('add')}>➕ Add Your First Event</button>
        </div>
      )}

      {!loading && allEvents.length > 0 && <div className="desktop-page-event-grid">
      {allEvents.map(e => (
        <div key={e.id}>
          {/* Visibility toggle row */}
          {!e.registrationOnly && <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '4px 4px 2px', flexWrap: 'wrap'
          }}>
            <span style={{
              fontSize: '0.6875rem', fontWeight: 600,
              color: e.hidden ? 'var(--cc-accent-strong)' : 'var(--cc-success)',
            }}>
              {e.hidden ? '🙈 Hidden from home screen' : '👁 Visible on home screen'}
            </span>
            <button
              onClick={() => handleToggle(e)}
              style={{
                fontSize: '0.6875rem', padding: '3px 10px', borderRadius: 6,
                border: 'none', cursor: 'pointer', fontWeight: 600,
                background: e.hidden ? 'var(--cc-accent-strong)' : 'var(--cc-background)',
                color: e.hidden ? 'var(--cc-on-primary)' : 'var(--cc-muted)',
              }}>
              {e.hidden ? '👁 Make Visible' : '🙈 Hide Event'}
            </button>
          </div>}

          {/* Event card with slight opacity if hidden */}
          <div style={{ opacity: e.hidden ? 0.65 : 1, transition: 'opacity 0.2s' }}>
            <EventCard
              event={e}
              user={user}
              profile={profile}
              onEdit={ev => { setEditingEvent(ev); setPage('edit'); }}
              onDelete={handleMyDelete}
              onCopy={handleCopy}
              isExpanded={expandedId === e.id}
              onExpand={setExpandedId}
              onStreamStart={onStreamStart}
              savedIds={savedIds} onSaveToggle={onSaveToggle} onCalendar={() => setPage('calendar')}
            />
            {e.registrationOnly && expandedId !== e.id && (e.canManage ?? (e.ownerUid === user?.uid)) && <div className="cc-registration-card-shortcuts"><button type="button" disabled={!registration?.open} onClick={() => registration.open(e, 'responses')}><ClipboardList size={19} aria-hidden="true"/>Registration responses</button></div>}
          </div>
        </div>
      ))}
      </div>}
    </>
  );
}
