import React, { useState } from 'react';
import EventCard from '../components/EventCard';
import EventFilters from '../components/EventFilters';
import { compareEventsByDateTime } from '../services/dateUtils';

export default function Home({ events, user, profile, setPage, setEditingEvent,
  handleDelete, handleCopy, isGuest = false, loadEvents,
  savedIds = [], onSaveToggle, onStreamStart }) {

  const today    = new Date().toISOString().slice(0, 10);
  const upcoming = events.filter(e => e.eventDate >= today).sort(compareEventsByDateTime);

  const [filtered,   setFiltered]   = useState(null);
  const [expandedId, setExpandedId] = useState('__first__');
  const [refreshing, setRefreshing] = useState(false);
  const [query,      setQuery]      = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadEvents();
    setRefreshing(false);
  };

  let displayed = filtered ?? upcoming;
  // Lightweight local text filter from the search bar
  if (query.trim()) {
    const q = query.toLowerCase();
    displayed = displayed.filter(e =>
      (e.eventType || '').toLowerCase().includes(q) ||
      (e.eventTypeDisplay || '').toLowerCase().includes(q) ||
      (e.hostName || '').toLowerCase().includes(q) ||
      (e.eventSubject || '').toLowerCase().includes(q) ||
      (e.address?.suburb || '').toLowerCase().includes(q)
    );
  }
  displayed = [...displayed].sort(compareEventsByDateTime);

  return (
    <>
      {/* ── Search bar (AI) with mic + send + filter ── */}
      <div style={{ padding: '8px 16px 6px', display:'flex', gap:8, alignItems:'center' }}>
        <div style={{ flex:1, display:'flex', alignItems:'center', gap:8,
          background:'white', border:'1px solid var(--border,#e8edec)',
          borderRadius:14, height:46, padding:'0 8px 0 14px',
          boxShadow:'0 2px 8px rgba(0,0,0,0.03)' }}>
          <span style={{ color:'var(--teal,#0f766e)', fontSize:'1rem' }}>🔍</span>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search events…"
            style={{ flex:1, border:'none', outline:'none', fontSize:'0.875rem',
              background:'transparent', color:'var(--text)' }} />
          {/* Mic */}
          <button aria-label="Voice search" onClick={() => setPage('search')} style={{
            background:'none', border:'none', cursor:'pointer', boxShadow:'none',
            fontSize:'1.0625rem', color:'var(--muted)', padding:'4px' }}>🎤</button>
          {/* Clear / Send */}
          {query.trim() ? (
            <button aria-label="Clear search" onClick={() => setQuery('')}
              style={{ width:32, height:32, borderRadius:'50%', border:'none',
                cursor:'pointer', flexShrink:0, display:'flex', alignItems:'center',
                justifyContent:'center', padding:0, background:'#d6dedc',
                color:'white', fontSize:'1rem' }}>×</button>
          ) : (
            <button aria-label="AI search" onClick={() => setPage('search')}
              style={{ width:32, height:32, borderRadius:'50%', border:'none',
                cursor:'pointer', flexShrink:0, display:'flex', alignItems:'center',
                justifyContent:'center', padding:0, background:'var(--teal,#0f766e)',
                color:'white', fontSize:'1rem' }}>↑</button>
          )}
        </div>
        {/* Filter icon (right of search bar) */}
        <button aria-label="Filters" onClick={() => setShowFilters(s => !s)} style={{
          width:46, height:46, borderRadius:14, flexShrink:0,
          background: showFilters ? 'var(--teal,#0f766e)' : 'white',
          color: showFilters ? 'white' : 'var(--teal,#0f766e)',
          border:'1px solid var(--border,#e8edec)', cursor:'pointer',
          fontSize:'1.125rem', display:'flex', alignItems:'center', justifyContent:'center',
          boxShadow:'0 2px 8px rgba(0,0,0,0.03)' }}>⚙️</button>
      </div>

      {/* ── PINNED block: section header + View Calendar & Sync (does NOT scroll away) ── */}
      <div style={{ position:'sticky', top:0, zIndex:10,
        background:'var(--bg,#f4f7f6)', paddingTop:4 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'6px 18px 8px' }}>
          <h2 style={{ margin:0, fontSize:'1.125rem', fontWeight:800, color:'var(--text)' }}>
            Upcoming Events
          </h2>
          <button onClick={handleRefresh} disabled={refreshing}
            style={{ background:'none', border:'none', cursor:'pointer', boxShadow:'none',
              color:'var(--teal,#0f766e)', fontSize:'0.75rem', fontWeight:800, padding:'0 4px' }}>
            {refreshing ? '⏳' : '🔄'} Refresh
          </button>
        </div>

        {/* View Calendar & Sync card — pinned */}
        <div onClick={() => setPage('calendar')} style={{
          margin:'0 16px 10px', cursor:'pointer',
          background:'linear-gradient(120deg,#0f766e,#0b5d57)', borderRadius:16,
          padding:'14px 16px', display:'flex', alignItems:'center',
          justifyContent:'space-between', color:'white',
          boxShadow:'0 4px 14px rgba(15,118,110,0.3)' }}>
          <span style={{ display:'flex', alignItems:'center', gap:10, fontWeight:800, fontSize:'0.875rem' }}>
            📅 View Calendar &amp; Sync
          </span>
          <span style={{ fontSize:'1.125rem' }}>›</span>
        </div>
      </div>

      {/* ── Filters (toggle from filter icon) ── */}
      {showFilters && <EventFilters events={upcoming} onChange={setFiltered} />}

      {/* ── Notices ── */}
      <div style={{ padding:'0 16px 10px', fontSize:'0.6875rem', color:'var(--muted)', fontWeight:600, lineHeight:1.6 }}>
        🌙 <em>Hijri dates subject to moon sighting.</em>
        &nbsp;·&nbsp;
        ℹ️ <em>Events are user-submitted — verify with hosts directly.</em>
      </div>

      {displayed.length === 0 && (
        <div className="card center">
          <p>No upcoming events{query ? ' match your search.' : ' yet.'}</p>
          {!isGuest && !query && <button onClick={() => setPage('add')}>Add the First Event</button>}
        </div>
      )}

      {/* ── Events list (scrolls under the pinned block) ── */}
      {displayed.map((e, idx) => (
        <EventCard key={e.id} event={e} user={user} profile={profile}
          onEdit={ev => { setEditingEvent(ev); setPage('edit'); }}
          onDelete={handleDelete} onCopy={handleCopy}
          isGuest={isGuest}
          isExpanded={expandedId === e.id || (expandedId === '__first__' && idx === 0)}
          onExpand={(id) => setExpandedId(id)}
          savedIds={savedIds}
          onSaveToggle={isGuest ? null : onSaveToggle}
          onStreamStart={onStreamStart}
        />
      ))}

      <div style={{ height: 24 }} />
    </>
  );
}
