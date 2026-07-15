import React, { useState, useEffect } from 'react';
import EventCard from '../components/EventCard';
import { getMyEvents, toggleEventVisibility } from '../services/eventService';

export default function MyEvents({ user, profile, setPage, setEditingEvent, handleDelete, handleCopy, onStreamStart }) {
  const [myEvents,  setMyEvents]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [expandedId, setExpandedId] = useState(null);

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
      <div className="card">
        <h2 style={{ margin: '0 0 4px' }}>My Events</h2>
        <p className="small" style={{ margin: 0, color: 'var(--muted)' }}>
          Events you created. Toggle visibility to show or hide from the home screen.
        </p>
      </div>

      {loading && (
        <div className="card center">
          <p style={{ color: 'var(--muted)' }}>Loading your events…</p>
        </div>
      )}

      {!loading && myEvents.length === 0 && (
        <div className="card center">
          <p style={{ color: 'var(--muted)', marginBottom: 12 }}>You haven't added any events yet.</p>
          <button onClick={() => setPage('add')}>➕ Add Your First Event</button>
        </div>
      )}

      {!loading && myEvents.length > 0 && <div className="desktop-page-event-grid">
      {myEvents.map(e => (
        <div key={e.id}>
          {/* Visibility toggle row */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '4px 4px 2px', flexWrap: 'wrap'
          }}>
            <span style={{
              fontSize: '0.6875rem', fontWeight: 600,
              color: e.hidden ? '#0f766e' : '#27ae60',
            }}>
              {e.hidden ? '🙈 Hidden from home screen' : '👁 Visible on home screen'}
            </span>
            <button
              onClick={() => handleToggle(e)}
              style={{
                fontSize: '0.6875rem', padding: '3px 10px', borderRadius: 6,
                border: 'none', cursor: 'pointer', fontWeight: 600,
                background: e.hidden ? '#0f766e' : '#f3f4f6',
                color: e.hidden ? 'white' : '#7f8c8d',
              }}>
              {e.hidden ? '👁 Make Visible' : '🙈 Hide Event'}
            </button>
          </div>

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
            />
          </div>
        </div>
      ))}
      </div>}
    </>
  );
}
