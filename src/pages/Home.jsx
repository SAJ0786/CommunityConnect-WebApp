import React, { useState, useEffect } from 'react';
import EventCard from '../components/EventCard';
import EventFilters from '../components/EventFilters';
import { todayLocal } from '../services/dateUtils';

export default function Home({ events, user, profile, setPage, setEditingEvent,
  handleDelete, handleCopy, isGuest = false, loadEvents,
  savedIds = [], onSaveToggle, onStreamStart, focusEventId, setFocusEventId }) {

  const today    = todayLocal();
  const upcoming = events.filter(e => e.eventDate >= today);

  const [filtered,   setFiltered]   = useState(null);
  const [expandedId, setExpandedId] = useState('__first__');
  const [refreshing, setRefreshing] = useState(false);
  const [query,      setQuery]      = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // When opened from a notification, expand + scroll to that event
  useEffect(() => {
    if (focusEventId) {
      setExpandedId(focusEventId);
      setQuery('');
      const t = setTimeout(() => {
        const el = document.getElementById(`event-${focusEventId}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setFocusEventId?.(null);
      }, 300);
      return () => clearTimeout(t);
    }
  }, [focusEventId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadEvents();
    setRefreshing(false);
  };

  let displayed = filtered ?? upcoming;
  // Smart keyword filter — tokenizes the query, ignores filler words,
  // and matches against type, host, subject, suburb, audience, and month.
  if (query.trim()) {
    const STOP = new Set(['event','events','this','the','in','on','at','for','a','an',
      'of','to','and','is','are','near','around','my','show','me','find','all','please']);
    const MONTHS = ['january','february','march','april','may','june','july','august',
      'september','october','november','december'];
    const AUDIENCE_WORDS = { kid:'kids', kids:'kids', child:'kids', children:'kids',
      lady:'ladies', ladies:'ladies', women:'ladies', gent:'gents', gents:'gents',
      men:'gents', family:'family', mixed:'family' };

    const tokens = query.toLowerCase().split(/\s+/)
      .map(t => t.replace(/[^a-z0-9]/g, ''))
      .filter(t => t && !STOP.has(t));

    if (tokens.length) {
      displayed = displayed.filter(e => {
        const hay = [
          e.eventType, e.eventTypeDisplay, e.hostName, e.eventSubject,
          e.address?.suburb, e.audienceType, e.speakerName,
        ].filter(Boolean).join(' ').toLowerCase();

        // Month name in query → match the event's month
        const evMonth = (() => {
          try { return MONTHS[new Date(e.eventDate + 'T00:00:00').getMonth()]; }
          catch { return ''; }
        })();

        // Every meaningful token must match somewhere (AND search)
        return tokens.every(tok => {
          if (hay.includes(tok)) return true;
          if (MONTHS.includes(tok)) return evMonth === tok;
          // Audience synonyms (kids → "kids only", etc.)
          const aud = AUDIENCE_WORDS[tok];
          if (aud) {
            const a = (e.audienceType || '').toLowerCase();
            if (aud === 'family') return a.includes('family') || a.includes('mixed');
            if (aud === 'kids')   return a.includes('kids');
            if (aud === 'ladies') return a.includes('ladies');
            if (aud === 'gents')  return a.includes('gents');
            return a.includes(aud);
          }
          return false;
        });
      });
    }
  }

  return (
    <>
      {/* ── Search bar — single pill, filter icon inside (right) ── */}
      <div style={{ padding: '8px 16px 6px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8,
          background:'white', border:'1px solid var(--border,#e8edec)',
          borderRadius:14, height:46, padding:'0 8px 0 14px',
          boxShadow:'0 2px 8px rgba(0,0,0,0.03)' }}>
          <span style={{ color:'var(--muted)', fontSize:16, flexShrink:0 }}>🔍</span>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search events…"
            style={{ flex:1, border:'none', outline:'none', fontSize:14,
              background:'transparent', color:'var(--text)', minWidth:0 }} />
          {/* Clear (only when text present) */}
          {query.trim() && (
            <button aria-label="Clear search" onClick={() => setQuery('')}
              style={{ width:24, height:24, borderRadius:'50%', border:'none',
                cursor:'pointer', flexShrink:0, display:'flex', alignItems:'center',
                justifyContent:'center', padding:0, background:'#d6dedc',
                color:'white', fontSize:13 }}>×</button>
          )}
          {/* Filter icon — inside the box on the right */}
          <button aria-label="Filters" onClick={() => setShowFilters(s => !s)} style={{
            background:'none', border:'none', cursor:'pointer', boxShadow:'none',
            flexShrink:0, padding:'4px 2px', display:'flex', alignItems:'center',
            justifyContent:'center',
            color: showFilters ? 'var(--teal,#0f766e)' : 'var(--muted)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="6" x2="20" y2="6"/><circle cx="9" cy="6" r="2" fill="currentColor"/>
              <line x1="4" y1="12" x2="20" y2="12"/><circle cx="15" cy="12" r="2" fill="currentColor"/>
              <line x1="4" y1="18" x2="20" y2="18"/><circle cx="8" cy="18" r="2" fill="currentColor"/>
            </svg>
          </button>
        </div>
      </div>

      {/* ── PINNED header (does NOT scroll away) ── */}
      <div style={{ position:'sticky', top:0, zIndex:10,
        background:'var(--bg,#f4f7f6)', paddingTop:4 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'6px 18px 8px' }}>
          <h2 style={{ margin:0, fontSize:18, fontWeight:800, color:'var(--text)' }}>
            Upcoming Events
          </h2>
          <button onClick={handleRefresh} disabled={refreshing}
            style={{ background:'none', border:'none', cursor:'pointer', boxShadow:'none',
              color:'var(--teal,#0f766e)', fontSize:12, fontWeight:800, padding:'0 4px' }}>
            {refreshing ? '⏳' : '🔄'} Refresh
          </button>
        </div>
      </div>

      {/* ── Filters (toggle from filter icon) ── */}
      {showFilters && <EventFilters events={upcoming} onChange={setFiltered} />}

      {/* ── Notices ── */}
      <div style={{ padding:'0 16px 10px', fontSize:11, color:'var(--muted)', fontWeight:600, lineHeight:1.6 }}>
        🌙 <em>Hijri dates subject to moon sighting.</em>
        &nbsp;·&nbsp;
        ℹ️ <em>Events are user-submitted — verify with hosts directly.</em>
      </div>

      {/* ── Login change notice — shown to guests and logged-in users briefly ── */}
      {isGuest && (
        <div style={{
          margin: '0 16px 12px', padding: '10px 14px', borderRadius: 12,
          background: '#fefce8', border: '1px solid #fde68a',
          fontSize: 12, color: '#92400e', lineHeight: 1.6,
        }}>
          📢 <strong>Login update:</strong> Google and Microsoft sign-in have been removed.
          Please use your mobile number to sign in. If you previously used Google or Microsoft,
          enter the <strong>same email address</strong> when prompted — we'll connect you to your existing account automatically.
        </div>
      )}

      {displayed.length === 0 && (
        <div className="card center">
          <p>No upcoming events{query ? ' match your search.' : ' yet.'}</p>
          {!isGuest && !query && <button onClick={() => setPage('add')}>Add the First Event</button>}
        </div>
      )}

      {/* ── Events list (scrolls under the pinned block) ── */}
      {displayed.map((e, idx) => (
        <div id={`event-${e.id}`} key={e.id}>
        <EventCard event={e} user={user} profile={profile}
          onEdit={ev => { setEditingEvent(ev); setPage('edit'); }}
          onDelete={handleDelete} onCopy={handleCopy}
          isGuest={isGuest}
          isExpanded={expandedId === e.id || (expandedId === '__first__' && idx === 0)}
          onExpand={(id) => setExpandedId(id)}
          savedIds={savedIds}
          onSaveToggle={isGuest ? null : onSaveToggle}
          onStreamStart={onStreamStart}
        />
        </div>
      ))}

      <div style={{ height: 88 }} />

      {/* ── View Calendar — fixed bar above bottom nav ── */}
      <div onClick={() => setPage('calendar')} style={{
        position:'fixed', bottom:'calc(76px + env(safe-area-inset-bottom))',
        left:16, right:16, zIndex:35, cursor:'pointer',
        background:'white',
        borderRadius:16, padding:'14px 18px', display:'flex', alignItems:'center',
        justifyContent:'space-between',
        boxShadow:'0 -2px 12px rgba(0,0,0,0.08), 0 4px 16px rgba(0,0,0,0.1)',
        border:'1px solid var(--border,#e8edec)' }}>
        <span style={{ display:'flex', alignItems:'center', gap:10,
          fontWeight:900, fontSize:15, color:'var(--text,#1a2b29)' }}>
          📅 <span>View Calendar</span>
        </span>
        <span style={{ fontSize:20, color:'var(--teal,#0f766e)', fontWeight:800 }}>›</span>
      </div>
    </>
  );
}
