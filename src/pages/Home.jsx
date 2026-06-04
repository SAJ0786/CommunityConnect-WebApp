import React, { useState, useEffect } from 'react';
import EventCard from '../components/EventCard';
import EventFilters from '../components/EventFilters';

const WA_ICON = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="#25d366">
    <path d="M12 2C6.48 2 2 6.48 2 12c0 1.85.5 3.58 1.37 5.07L2 22l5.09-1.34A9.94 9.94 0 0012 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm0 18c-1.66 0-3.22-.46-4.55-1.26l-.32-.19-3.03.8.81-2.96-.21-.34A7.96 7.96 0 014 12c0-4.42 3.58-8 8-8s8 3.58 8 8-3.58 8-8 8zm4.45-5.95c-.24-.12-1.43-.7-1.65-.78-.22-.08-.38-.12-.54.12-.16.24-.62.78-.76.94-.14.16-.28.18-.52.06-.24-.12-1.01-.37-1.92-1.18-.71-.63-1.19-1.41-1.33-1.65-.14-.24-.01-.37.1-.49.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.54-1.3-.74-1.78-.19-.47-.39-.4-.54-.41h-.46c-.16 0-.42.06-.64.3-.22.24-.84.82-.84 2s.86 2.32.98 2.48c.12.16 1.69 2.58 4.1 3.62.57.25 1.02.39 1.37.5.57.18 1.09.16 1.5.1.46-.07 1.43-.58 1.63-1.15.2-.57.2-1.06.14-1.15-.06-.1-.22-.16-.46-.28z"/>
  </svg>
);

// 3×2 quick action grid — same as prototype
const QUICK_ACTIONS = [
  { key:'install',  label:'Install App', emoji:'📲', page:null,       guestOk:true  },
  { key:'search',   label:'AI Search',   emoji:'🤖', page:'search',   guestOk:true  },
  { key:'calendar', label:'Calendar',    emoji:'📅', page:'calendar', guestOk:false },
  { key:'add',      label:'Add Event',   emoji:'➕', page:'add',      guestOk:false },
  { key:'my',       label:'My Events',   emoji:'📋', page:'my',       guestOk:false },
  { key:'favourites', label:'Favourites', emoji:'⭐', page:'favourites', guestOk:false },
];

export default function Home({ events, user, profile, setPage, setEditingEvent,
  handleDelete, handleCopy, isGuest = false, loadEvents,
  savedIds = [], onSaveToggle }) {

  const today    = new Date().toISOString().slice(0, 10);
  const upcoming = events.filter(e => e.eventDate >= today);

  const [filtered,        setFiltered]       = useState(null);
  const [expandedId,      setExpandedId]     = useState('__first__'); // expand first card by default
  const [showInstall,     setShowInstall]    = useState(false);
  const [installPlatform, setInstallPlatform]= useState('iphone');
  const [refreshing,      setRefreshing]     = useState(false);


  const handleRefresh = async () => {
    setRefreshing(true);
    await loadEvents();
    setRefreshing(false);
  };

  // Cards stay expanded until another card is tapped

  const displayed = filtered ?? upcoming;

  const handleAction = (action) => {
    if (!action.guestOk && isGuest) return;
    if (action.key === 'install') { setShowInstall(true); return; }
    if (action.page) setPage(action.page);
  };

  return (
    <>
      {/* ── 3×2 Quick action menu grid ── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, padding:'16px 16px 8px' }}>
        {QUICK_ACTIONS.map(action => {
          const disabled = !action.guestOk && isGuest;
          const isActive = action.key === 'cards' && viewMode === 'card';
          return (
            <button key={action.key} type="button"
              onClick={() => handleAction(action)}
              disabled={disabled}
              title={disabled ? 'Login required' : action.label}
              style={{
                background: isActive ? 'var(--red,#c0392b)' : disabled ? '#f0f2f5' : 'var(--card,white)',
                border: `1.5px solid ${isActive ? 'var(--red,#c0392b)' : disabled ? 'var(--border)' : 'var(--border)'}`,
                borderRadius: 16, padding: '14px 8px 12px',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7,
                cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.5 : 1,
                boxShadow: isActive ? '0 4px 14px rgba(192,57,43,0.35)' : disabled ? 'none' : 'var(--shadow-sm)',
                transition: 'all 0.2s',
              }}>
              <span style={{ fontSize: 24, lineHeight: 1 }}>{action.emoji}</span>
              <span style={{
                fontWeight: 800, fontSize: 10, lineHeight: 1.2, textAlign: 'center',
                color: isActive ? 'white' : disabled ? 'var(--muted)' : 'var(--muted)',
                fontFamily: 'var(--font)',
              }}>
                {action.key === 'cards'
                  ? (viewMode === 'card' ? 'List View' : 'Card View')
                  : action.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Section heading ── */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'6px 16px 10px' }}>
        <h2 style={{ margin:0, fontSize:16, fontWeight:900, color:'var(--text)', fontFamily:'var(--font)' }}>
          Upcoming Events
        </h2>
        <button onClick={handleRefresh} disabled={refreshing}
          style={{ background:'none', border:'none', cursor:'pointer', boxShadow:'none',
            color:'var(--red)', fontSize:12, fontWeight:800, padding:'0 4px', margin:0 }}>
          {refreshing ? '⏳' : '🔄'} Refresh
        </button>
      </div>

      {/* ── Notices — single compact line ── */}
      <div style={{ padding:'0 16px 10px', fontSize:11, color:'var(--muted)', fontWeight:600, lineHeight:1.6 }}>
        🌙 <em>Hijri dates subject to moon sighting.</em>
        &nbsp;·&nbsp;
        ℹ️ <em>Events are user-submitted — verify with hosts directly.</em>
      </div>

      {/* ── Filters ── */}
      <EventFilters events={upcoming} onChange={setFiltered} />

      {displayed.length === 0 && (
        <div className="card center">
          <p>No upcoming events yet.</p>
          {!isGuest && <button onClick={() => setPage('add')}>Add the First Event</button>}
        </div>
      )}

      {/* ── Events list ── */}
      {displayed.map((e, idx) => {
        const isFirst = idx === 0 && expandedId === '__first__';
        return (
        <EventCard key={e.id} event={e} user={user} profile={profile}
          onEdit={ev => { setEditingEvent(ev); setPage('edit'); }}
          onDelete={handleDelete} onCopy={handleCopy}
          isGuest={isGuest}
          isExpanded={expandedId === e.id || (expandedId === '__first__' && idx === 0)}
          onExpand={(id) => setExpandedId(id)}
          savedIds={savedIds}
          onSaveToggle={isGuest ? null : onSaveToggle}
        />
      );
      })}

      <div style={{ height: 32 }} />

      {/* ── Install Modal ── */}
      {showInstall && (
        <div onClick={() => setShowInstall(false)} style={{
          position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:9999,
          display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div onClick={e => e.stopPropagation()} style={{
            background:'var(--card,white)', borderRadius:22, padding:24,
            width:'100%', maxWidth:440,
            boxShadow:'0 20px 60px rgba(0,0,0,0.35)', border:'1px solid var(--border)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
              <h2 style={{ margin:0, fontSize:18, fontFamily:'var(--font)', fontWeight:900 }}>📲 Install App</h2>
              <button onClick={() => setShowInstall(false)}
                style={{ background:'transparent', border:'none', fontSize:20, cursor:'pointer',
                  color:'var(--muted)', boxShadow:'none', padding:'4px', margin:0 }}>✕</button>
            </div>
            <div style={{ display:'flex', gap:8, marginBottom:20 }}>
              {[['iphone','🍎 iPhone'],['android','🤖 Android']].map(([key, label]) => (
                <button key={key} onClick={() => setInstallPlatform(key)} style={{
                  flex:1, padding:'10px 8px', borderRadius:12, fontWeight:800, fontSize:13, cursor:'pointer',
                  background: installPlatform===key ? 'var(--red)' : 'var(--bg,#f8f9fa)',
                  color:      installPlatform===key ? 'white'      : 'var(--text)',
                  border:`1.5px solid ${installPlatform===key ? 'var(--red)' : 'var(--border)'}`,
                  boxShadow: installPlatform===key ? '0 3px 10px rgba(192,57,43,0.3)' : 'none',
                }}>{label}</button>
              ))}
            </div>
            {installPlatform === 'iphone' ? (
              <ol style={{ margin:0, paddingLeft:22, color:'var(--text)', fontSize:14, lineHeight:2, fontFamily:'var(--font)', fontWeight:600 }}>
                <li>Open in <strong>Safari</strong> (not Chrome)</li>
                <li>Tap <strong>Share ⬆️</strong> at the bottom</li>
                <li>Tap <strong>"Add to Home Screen"</strong></li>
                <li>Tap <strong>Add</strong> ✅</li>
              </ol>
            ) : (
              <ol style={{ margin:0, paddingLeft:22, color:'var(--text)', fontSize:14, lineHeight:2, fontFamily:'var(--font)', fontWeight:600 }}>
                <li>Open in <strong>Chrome</strong></li>
                <li>Tap <strong>⋮ menu</strong> top right</li>
                <li>Tap <strong>"Add to Home Screen"</strong></li>
                <li>Tap <strong>Install</strong> ✅</li>
              </ol>
            )}
            <div style={{ marginTop:14, padding:'10px 14px', background:'var(--red-l,#fdf2f1)',
              borderRadius:10, fontSize:12, color:'var(--muted)', lineHeight:1.5, fontWeight:600 }}>
              💡 Loads instantly, works offline, feels like a native app.
            </div>
            <button style={{ width:'100%', marginTop:14 }} onClick={() => setShowInstall(false)}>
              Got it!
            </button>
          </div>
        </div>
      )}
    </>
  );
}
