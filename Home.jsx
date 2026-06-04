import React, { useState, useEffect } from 'react';
import EventCard from '../components/EventCard';
import EventFilters from '../components/EventFilters';

// Tabler icon component
const Icon = ({ name, color, size = 22 }) => (
  <i className={`ti ti-${name}`} style={{ fontSize: size, color }} aria-hidden="true" />
);

const QUICK_ACTIONS = [
  {
    key:     'install',
    label:   'Install App',
    sub:     'Add to home screen',
    icon:    'device-mobile-down',
    color:   '#b45309',
    page:    null,
    guestOk: true,
  },
  {
    key:     'search',
    label:   'AI Search',
    sub:     'Ask anything',
    icon:    'sparkles',
    color:   '#7c3aed',
    page:    'search',
    guestOk: true,
  },
  {
    key:     'calendar',
    label:   'Calendar Sync',
    sub:     'Sync to phone',
    icon:    'calendar-event',
    color:   '#2563eb',
    page:    'calendar',
    guestOk: false,
  },
  {
    key:     'add',
    label:   'Add Event',
    sub:     'Share an event',
    icon:    'circle-plus',
    color:   '#16a34a',
    page:    'add',
    guestOk: false,
  },
  {
    key:     'my',
    label:   'My Events',
    sub:     'Events you added',
    icon:    'layout-list',
    color:   '#ea580c',
    page:    'my',
    guestOk: false,
  },
];

export default function Home({ events, user, profile, setPage, setEditingEvent, handleDelete, handleCopy, isGuest = false, loadEvents, savedIds = [], onSaveToggle }) {
  const today    = new Date().toISOString().slice(0, 10);
  const upcoming = events.filter(e => e.eventDate >= today);
  const [filtered,        setFiltered]        = useState(null);
  const [expandedId,      setExpandedId]      = useState(null);
  const [showInstall,     setShowInstall]      = useState(false);
  const [installPlatform, setInstallPlatform]  = useState('iphone');
  const [refreshing,      setRefreshing]       = useState(false);
  const [viewMode,        setViewMode]         = useState(() => {
    try { return localStorage.getItem('homeView') || 'card'; } catch { return 'card'; }
  });
  const [cardIndex,       setCardIndex]        = useState(0);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadEvents();
    setRefreshing(false);
  };

  // Reset filter when events change
  useEffect(() => { setFiltered(null); setCardIndex(0); }, [events]);

  const switchView = (mode) => {
    setViewMode(mode);
    try { localStorage.setItem('homeView', mode); } catch {}
  };

  const swipeNext = () => setCardIndex(i => Math.min(i + 1, displayed.length));
  const swipePrev = () => setCardIndex(i => Math.max(i - 1, 0));

  useEffect(() => {
    const onScroll = () => setExpandedId(null);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  const displayed = filtered ?? upcoming;

  const handleAction = (action) => {
    if (!action.guestOk && isGuest) return;
    if (action.key === 'install') { setShowInstall(true); return; }
    if (action.page) setPage(action.page);
  };

  return (
    <>
      {/* Quick action buttons — all 4 in one row, compact size */}
      <div style={{ padding: '10px 16px 4px' }}>
        {/* Row 1: first 3 actions */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 8 }}>
          {QUICK_ACTIONS.slice(0, 3).map(action => {
            const disabled = !action.guestOk && isGuest;
            return (
              <button
                key={action.key}
                type="button"
                onClick={() => handleAction(action)}
                disabled={disabled}
                title={disabled ? 'Login required' : action.sub}
                style={{
                  background: disabled ? 'var(--border,#f3f4f6)' : 'var(--teal-l,#e6f4f1)',
                  border: `1px solid ${disabled ? 'var(--border,#e5e7eb)' : 'var(--teal,#0f766e)'}`,
                  borderRadius: 12,
                  padding: '8px 4px',
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', gap: 5,
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  opacity: disabled ? 0.5 : 1,
                }}
              >
                <div style={{
                  width: 36, height: 36,
                  background: 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon name={action.icon} color={disabled ? '#9ca3af' : action.color} size={22} />
                </div>
                <div style={{ fontWeight: 600, fontSize: 10, color: disabled ? 'var(--muted)' : 'var(--teal)', textAlign: 'center', lineHeight: 1.2 }}>
                  {action.label}
                </div>
              </button>
            );
          })}
        </div>
        {/* Row 2: last 2 actions — equal width filling full row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
          {QUICK_ACTIONS.slice(3).map(action => {
            const disabled = !action.guestOk && isGuest;
            return (
              <button
                key={action.key}
                type="button"
                onClick={() => handleAction(action)}
                disabled={disabled}
                title={disabled ? 'Login required' : action.sub}
                style={{
                  background: disabled ? 'var(--border,#f3f4f6)' : 'var(--teal-l,#e6f4f1)',
                  border: `1px solid ${disabled ? 'var(--border,#e5e7eb)' : 'var(--teal,#0f766e)'}`,
                  borderRadius: 12,
                  padding: '8px 4px',
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', gap: 5,
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  opacity: disabled ? 0.5 : 1,
                }}
              >
                <div style={{ width: 36, height: 36, background: 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={action.icon} color={disabled ? '#9ca3af' : action.color} size={22} />
                </div>
                <div style={{ fontWeight: 600, fontSize: 10, color: disabled ? 'var(--muted)' : 'var(--teal)', textAlign: 'center', lineHeight: 1.2 }}>
                  {action.label}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Upcoming events header */}
      <div className="card" style={{ marginBottom: 0 }}>
        <h2 style={{ margin: '0 0 4px' }}>Upcoming Events</h2>
        <p className="small" style={{ margin: '0 0 8px' }}>
          {displayed.length} event{displayed.length !== 1 ? 's' : ''} shown &nbsp;·&nbsp;
          <button onClick={handleRefresh} disabled={refreshing}
            style={{ background:'none', border:'none', cursor:'pointer', color:'var(--teal)',
              fontSize:12, fontWeight:600, padding:'0 4px' }}>
            {refreshing ? '⏳' : '🔄'} Refresh
          </button>
        </p>
        {/* Notices — compact single line each */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <p style={{ margin: 0, fontSize: 11, color: 'var(--muted)', lineHeight: 1.4 }}>
            🌙 <em>Hijri dates subject to moon sighting confirmation.</em>
            &nbsp;·&nbsp;
            ℹ️ <em>Events are user-submitted. Contact hosts directly to verify details. App owners are not responsible for accuracy.</em>
          </p>
        </div>
      </div>


      {/* View toggle */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'4px 16px 8px' }}>
        <div style={{ display:'flex', gap:6 }}>
          <button
            onClick={() => switchView('card')}
            style={{ padding:'5px 12px', borderRadius:8, fontSize:12, fontWeight:600, cursor:'pointer',
              background: viewMode==='card' ? 'var(--teal)' : 'var(--bg,#f3f4f6)',
              color: viewMode==='card' ? 'white' : 'var(--muted)',
              border: `1px solid ${viewMode==='card' ? 'var(--teal)' : 'var(--border)'}` }}>
            🃏 Card View
          </button>
          <button
            onClick={() => switchView('list')}
            style={{ padding:'5px 12px', borderRadius:8, fontSize:12, fontWeight:600, cursor:'pointer',
              background: viewMode==='list' ? 'var(--teal)' : 'var(--bg,#f3f4f6)',
              color: viewMode==='list' ? 'white' : 'var(--muted)',
              border: `1px solid ${viewMode==='list' ? 'var(--teal)' : 'var(--border)'}` }}>
            ☰ List View
          </button>
        </div>
        {viewMode==='card' && displayed.length > 0 && (
          <span style={{ fontSize:11, color:'var(--muted)' }}>
            {Math.min(cardIndex+1, displayed.length)} of {displayed.length}
          </span>
        )}
      </div>

      <EventFilters events={upcoming} onChange={setFiltered} />

      {displayed.length === 0 && (
        <div className="card center">
          <p>No upcoming events yet.</p>
          {!isGuest && <button onClick={() => setPage('add')}>Add the First Event</button>}
        </div>
      )}

      {/* ── CARD / SWIPE VIEW ── */}
      {viewMode === 'card' && displayed.length > 0 && (
        <div style={{ padding:'0 16px' }}>
          {/* Action buttons row */}
          <div style={{ display:'flex', justifyContent:'center', alignItems:'center', gap:12, marginBottom:12 }}>
            <button onClick={swipePrev} disabled={cardIndex === 0}
              style={{ width:44, height:44, borderRadius:12, border:'1px solid var(--border)',
                background:'var(--card,white)', cursor: cardIndex===0 ? 'not-allowed':'pointer',
                opacity: cardIndex===0 ? 0.4:1, fontSize:18, display:'flex', alignItems:'center', justifyContent:'center' }}>
              ‹
            </button>

            {/* Share */}
            <button onClick={() => {
                const e = displayed[cardIndex];
                if (e && window.__showShareSheet) {
                  const a = e.address||{};
                  const isP = e.organiserType==='private';
                  const loc = isP ? (a.suburb||'') : (a.fullAddress||a.suburb||'');
                  const fmtD = d => { try { return new Date(d+'T00:00:00').toLocaleDateString('en-AU',{weekday:'short',day:'numeric',month:'short'}); } catch { return d; } };
                  window.__showShareSheet([
                    `📅 *${e.eventTypeDisplay||e.eventType}*`,
                    `🏠 *Host:* ${e.hostName}`,
                    `📆 *Date:* ${fmtD(e.eventDate)}`,
                    `⏰ *Time:* ${e.startTime}${e.endTime?' – '+e.endTime:''}`,
                    loc ? `📍 ${isP?'*Suburb:*':'*Location:*'} ${loc}` : '',
                    e.hijriDate ? `🌙 *Hijri:* ${e.hijriDate}` : '',
                    e.speakerName ? `🎤 *Speaker:* ${e.speakerName}` : '',
                    e.audienceType ? `👥 ${e.audienceType}` : '',
                    '', '_Shared via Community Events Australia_', '_communityevents.siza.info_',
                  ].filter(Boolean).join('\n'));
                }
              }}
              style={{ width:48, height:48, borderRadius:14, border:'none',
                background:'#25d366', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                <path d="M12 2C6.48 2 2 6.48 2 12c0 1.85.5 3.58 1.37 5.07L2 22l5.09-1.34A9.94 9.94 0 0012 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm0 18c-1.66 0-3.22-.46-4.55-1.26l-.32-.19-3.03.8.81-2.96-.21-.34A7.96 7.96 0 014 12c0-4.42 3.58-8 8-8s8 3.58 8 8-3.58 8-8 8zm4.45-5.95c-.24-.12-1.43-.7-1.65-.78-.22-.08-.38-.12-.54.12-.16.24-.62.78-.76.94-.14.16-.28.18-.52.06-.24-.12-1.01-.37-1.92-1.18-.71-.63-1.19-1.41-1.33-1.65-.14-.24-.01-.37.1-.49.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.54-1.3-.74-1.78-.19-.47-.39-.4-.54-.41h-.46c-.16 0-.42.06-.64.3-.22.24-.84.82-.84 2s.86 2.32.98 2.48c.12.16 1.69 2.58 4.1 3.62.57.25 1.02.39 1.37.5.57.18 1.09.16 1.5.1.46-.07 1.43-.58 1.63-1.15.2-.57.2-1.06.14-1.15-.06-.1-.22-.16-.46-.28z"/>
              </svg>
            </button>

            {/* Save/Favourite */}
            {!isGuest && onSaveToggle && displayed[cardIndex] && (
              <button
                onClick={() => { const e=displayed[cardIndex]; onSaveToggle(e.id, !savedIds.includes(e.id)); }}
                style={{ width:48, height:48, borderRadius:14, border:'none',
                  background: savedIds.includes(displayed[cardIndex]?.id) ? '#fef3c7' : 'var(--teal)',
                  cursor:'pointer', fontSize:22, display:'flex', alignItems:'center', justifyContent:'center' }}>
                {savedIds.includes(displayed[cardIndex]?.id) ? '⭐' : '☆'}
              </button>
            )}

            {/* Directions */}
            <button
              disabled={isGuest}
              onClick={() => {
                const e = displayed[cardIndex];
                if (!e) return;
                const a = e.address||{};
                const q = encodeURIComponent(a.fullAddress || a.suburb || '');
                const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
                window.open(isIOS ? `maps://maps.apple.com/?q=${q}` : `https://maps.google.com/?q=${q}`, '_blank');
              }}
              style={{ width:48, height:48, borderRadius:14, border:'none',
                background: isGuest ? 'var(--border)' : '#4285f4',
                cursor: isGuest ? 'not-allowed':'pointer', opacity: isGuest ? 0.4:1,
                display:'flex', alignItems:'center', justifyContent:'center' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
              </svg>
            </button>

            <button onClick={swipeNext} disabled={cardIndex >= displayed.length - 1}
              style={{ width:44, height:44, borderRadius:12, border:'1px solid var(--border)',
                background:'var(--card,white)', cursor: cardIndex>=displayed.length-1 ? 'not-allowed':'pointer',
                opacity: cardIndex>=displayed.length-1 ? 0.4:1, fontSize:18, display:'flex', alignItems:'center', justifyContent:'center' }}>
              ›
            </button>
          </div>

          {/* Card */}
          {displayed[cardIndex] && (() => {
            const e = displayed[cardIndex];
            const a = e.address||{};
            const isPrivate = e.organiserType === 'private';
            const addr = isGuest || isPrivate
              ? `${a.suburb||''}${a.state ? ', '+a.state : ''}`
              : (a.fullAddress || `${a.street||''} ${a.suburb||''} ${a.state||''} ${a.postcode||''}`.trim());
            const fmtD = d => { try { return new Date(d+'T00:00:00').toLocaleDateString('en-AU',{weekday:'long',day:'numeric',month:'long',year:'numeric'}); } catch { return d; } };
            return (
              <div className="card" style={{
                borderRadius:20, padding:0, overflow:'hidden',
                border: '1.5px solid var(--border)',
                boxShadow:'0 8px 32px rgba(0,0,0,0.1)',
              }}>
                {/* Top colour strip */}
                <div style={{ height:5, background:'var(--teal)' }} />
                <div style={{ padding:'16px 18px 14px' }}>
                  {/* Badges */}
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:10 }}>
                    <span className="badge">{e.eventTypeDisplay||e.eventType}</span>
                    <span className="badge" style={{
                      background: isPrivate ? '#f0fdf4' : 'var(--teal-l,#ede9fe)',
                      color: isPrivate ? '#166534' : 'var(--teal)' }}>
                      {isPrivate ? '🔒 Private' : '🏛 Centre'}
                    </span>
                    {e.hijriDate && (
                      <span className="badge" style={{ background:'#fef3c7', color:'#92400e' }}>
                        🌙 {e.hijriDate}
                      </span>
                    )}
                  </div>
                  {/* Title */}
                  <h2 style={{ margin:'0 0 4px', fontSize:19, fontWeight:800, color:'var(--text)', lineHeight:1.3 }}>
                    {e.eventTypeDisplay||e.eventType} Programme
                  </h2>
                  <p style={{ margin:'0 0 14px', fontSize:13, color:'var(--muted)' }}>🏠 {e.hostName}</p>
                  {/* Details */}
                  <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                    <div style={{ display:'flex', gap:10 }}><span style={{ fontSize:16 }}>📅</span><span style={{ fontSize:13, color:'var(--text)' }}>{fmtD(e.eventDate)}</span></div>
                    <div style={{ display:'flex', gap:10 }}><span style={{ fontSize:16 }}>⏰</span><span style={{ fontSize:13, color:'var(--text)' }}>{e.startTime}{e.endTime ? ' – '+e.endTime : ''}</span></div>
                    <div style={{ display:'flex', gap:10 }}><span style={{ fontSize:16 }}>📍</span>
                      <div>
                        <div style={{ fontSize:13, color:'var(--text)' }}>{addr}</div>
                        {(isGuest || isPrivate) && <div style={{ fontSize:11, color:'var(--muted)' }}>{isGuest ? 'Login for full address' : 'Contact host for full address'}</div>}
                      </div>
                    </div>
                    {e.audienceType && <div style={{ display:'flex', gap:10 }}><span style={{ fontSize:16 }}>👥</span><span style={{ fontSize:13, color:'var(--text)' }}>{e.audienceType}</span></div>}
                    {e.speakerName && <div style={{ display:'flex', gap:10 }}><span style={{ fontSize:16 }}>🎤</span><span style={{ fontSize:13, color:'var(--text)' }}>{e.speakerName}</span></div>}
                    {(e.reciters||[]).filter(r=>r.name).map((r,i) => (
                      <div key={i} style={{ display:'flex', gap:10 }}>
                        <span style={{ fontSize:16 }}>🎵</span>
                        <div>
                          <div style={{ fontSize:13, color:'var(--text)' }}>{r.name}</div>
                          <div style={{ fontSize:11, color:'var(--muted)' }}>{r.customType||r.type}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                {/* Footer */}
                <div style={{ borderTop:'1px solid var(--border)', padding:'10px 18px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span style={{ fontSize:11, color:'var(--muted)', fontWeight:600 }}>
                    {cardIndex+1} of {displayed.length} events
                  </span>
                  <div style={{ display:'flex', gap:6 }}>
                    {Array.from({length: Math.min(5, displayed.length)}, (_,i) => (
                      <button key={i} onClick={() => setCardIndex(i)} style={{
                        width: i===cardIndex ? 20 : 7, height:7, borderRadius:4, padding:0, border:'none',
                        background: i===cardIndex ? 'var(--teal)' : 'var(--border)', cursor:'pointer',
                        transition:'all 0.25s'
                      }}/>
                    ))}
                    {displayed.length > 5 && <span style={{ fontSize:10, color:'var(--muted)' }}>+{displayed.length-5}</span>}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Swipe hint */}
          <p style={{ textAlign:'center', fontSize:11, color:'var(--muted)', marginTop:10 }}>
            Use ‹ › to browse · Swipe supported on touch devices
          </p>
        </div>
      )}

      {/* ── LIST VIEW ── */}
      {viewMode === 'list' && displayed.map(e => (
        <EventCard
          key={e.id}
          event={e}
          user={user}
          profile={profile}
          onEdit={ev => { setEditingEvent(ev); setPage('edit'); }}
          onDelete={handleDelete}
          onCopy={handleCopy}
          isGuest={isGuest}
          isExpanded={expandedId === e.id}
          onExpand={setExpandedId}
          savedIds={savedIds}
          onSaveToggle={isGuest ? null : onSaveToggle}
        />
      ))}

      <div style={{ height: 32 }} />

      {/* ── Install App Modal ── */}
      {showInstall && (
        <div
          onClick={() => setShowInstall(false)}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.65)',
            zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 16,
          }}>
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--card,white)',
              borderRadius: 20, padding: 24,
              width: '100%', maxWidth: 440,
              boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
              border: '1px solid var(--border)',
            }}>
            {/* Header */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 20, color: 'var(--text)' }}>📲 Install This App</h2>
              <button
                onClick={() => setShowInstall(false)}
                style={{ background:'transparent', border:'none', fontSize: 22, cursor:'pointer', color:'var(--muted)', lineHeight:1 }}>
                ✕
              </button>
            </div>

            {/* Platform toggle */}
            <div style={{ display:'flex', gap: 8, marginBottom: 20 }}>
              {[
                { key:'iphone',  label:'🍎 iPhone / iPad' },
                { key:'android', label:'🤖 Android' },
              ].map(p => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setInstallPlatform(p.key)}
                  style={{
                    flex: 1, padding: '9px 8px', borderRadius: 10,
                    fontWeight: 600, fontSize: 13, cursor: 'pointer',
                    background: installPlatform === p.key ? 'var(--teal)' : 'var(--bg,white)',
                    color:      installPlatform === p.key ? 'white'       : 'var(--text)',
                    border: `1.5px solid ${installPlatform === p.key ? 'var(--teal)' : 'var(--border)'}`,
                  }}>
                  {p.label}
                </button>
              ))}
            </div>

            {/* iPhone instructions */}
            {installPlatform === 'iphone' && (
              <ol style={{ margin: 0, paddingLeft: 22, color: 'var(--text)', fontSize: 14, lineHeight: 2 }}>
                <li>Open the app link in <strong>Safari</strong> (not Chrome)</li>
                <li>Tap the <strong>Share button ⬆️</strong> at the bottom of Safari</li>
                <li>Scroll down and tap <strong>"Add to Home Screen"</strong></li>
                <li>Tap <strong>Add</strong> — ✅ the app icon appears on your home screen</li>
              </ol>
            )}

            {/* Android instructions */}
            {installPlatform === 'android' && (
              <ol style={{ margin: 0, paddingLeft: 22, color: 'var(--text)', fontSize: 14, lineHeight: 2 }}>
                <li>Open the app link in <strong>Chrome</strong></li>
                <li>Tap the <strong>three-dot menu ⋮</strong> at the top right</li>
                <li>Tap <strong>"Add to Home Screen"</strong> or <strong>"Install App"</strong></li>
                <li>Tap <strong>Install</strong> — ✅ the app icon appears on your home screen</li>
              </ol>
            )}

            <div style={{
              marginTop: 16, padding: '10px 14px',
              background: 'var(--teal-l,#e6f4f1)', borderRadius: 10,
              fontSize: 12, color: 'var(--muted)', lineHeight: 1.5,
            }}>
              💡 Once installed, the app works faster, loads offline, and feels like a native app.
            </div>

            <button
              style={{ width: '100%', marginTop: 16 }}
              onClick={() => setShowInstall(false)}>
              Got it!
            </button>
          </div>
        </div>
      )}
    </>
  );
}
