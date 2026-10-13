import React, { useState, useEffect, useCallback } from 'react';
import EventCard from '../components/EventCard';
import { getSavedEvents, toggleSavedEvent } from '../services/userService';

export default function Favourites({ user, profile, events, setPage, setEditingEvent, handleDelete, handleCopy, onStreamStart }) {
  const [savedIds,   setSavedIds]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [expandedId, setExpandedId] = useState(null);

  const load = useCallback(async () => {
    if (!user?.uid) return;
    setLoading(true);
    const ids = await getSavedEvents(user.uid);
    setSavedIds(ids);
    setLoading(false);
  }, [user?.uid]);

  useEffect(() => { load(); }, [load]);

  const handleUnsave = async (eventId) => {
    await toggleSavedEvent(user.uid, eventId, false);
    setSavedIds(prev => prev.filter(id => id !== eventId));
  };

  const saved = events.filter(e => savedIds.includes(e.id));

  return (
    <>
      <div className="card" style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <h2 style={{ margin:'0 0 4px' }}>⭐ Favourites</h2>
          <p className="small" style={{ margin:0, color:'var(--muted)' }}>
            Events you've saved. Tap ⭐ on any event to save it here.
          </p>
        </div>
        {saved.length > 0 && (
          <span style={{ fontSize:'0.8125rem', color:'var(--teal)', fontWeight:700 }}>
            {saved.length}
          </span>
        )}
      </div>

      {loading && (
        <div className="card center">
          <p style={{ color:'var(--muted)' }}>Loading favourites…</p>
        </div>
      )}

      {!loading && saved.length === 0 && (
        <div className="card center" style={{ padding:32 }}>
          <div style={{ fontSize:'3rem', marginBottom:12 }}>⭐</div>
          <h3 style={{ margin:'0 0 8px', color:'var(--text)' }}>No saved events yet</h3>
          <p className="small" style={{ color:'var(--muted)', marginBottom:16 }}>
            Tap the ⭐ button on any event card to save it here for quick access.
          </p>
          <button onClick={() => setPage('home')}>← Browse Events</button>
        </div>
      )}

      {!loading && saved.length > 0 && <div className="desktop-page-event-grid">
      {saved.map(e => (
        <div key={e.id}>
          {/* Unsave button */}
          <div style={{ display:'flex', alignItems:'center', gap:8, padding:'4px 4px 2px' }}>
            <button
              onClick={() => handleUnsave(e.id)}
              style={{
                fontSize:'0.6875rem', padding:'3px 10px', borderRadius:6,
                border:'none', cursor:'pointer', fontWeight:600,
                background:'var(--cc-warning-soft)', color:'var(--cc-warning-strong)',
              }}>
              ⭐ Remove from Favourites
            </button>
          </div>
          <EventCard
            event={e} user={user} profile={profile}
            onEdit={ev => { setEditingEvent(ev); setPage('edit'); }}
            onDelete={handleDelete}
            onCopy={handleCopy}
            onStreamStart={onStreamStart} onCalendar={() => setPage('calendar')}
            isExpanded={expandedId === e.id}
            onExpand={setExpandedId}
            savedIds={savedIds}
            onSaveToggle={async (id, save) => {
              await toggleSavedEvent(user.uid, id, save);
              setSavedIds(prev => save ? [...prev, id] : prev.filter(x => x !== id));
            }}
            isGuest={false}
          />
        </div>
      ))}
      </div>}
    </>
  );
}
