import React, { useEffect, useState, useMemo } from 'react';
import EventCard from '../components/EventCard';
import CalendarSync from './CalendarSync';
import { compareEventsByDateTime } from '../services/dateUtils';
import { getHijriSettings } from '../services/settingsService';
import { getHijriParts, HIJRI_MONTHS } from '../services/hijriService';
import CitySelector from '../components/CitySelector';
import { DEFAULT_CITY, getEventMetroArea, normalizeCity } from '../utils/cities';

// Category dot colour by audience type
const dotColor = (a) => {
  const n = a === 'Mixed Audience' ? 'Family Event' : a;
  if (n === 'Family Event') return '#2563eb';
  if (n === 'Gents only')   return '#0f766e';
  if (n === 'Ladies only')  return '#db2777';
  if (n === 'Kids only')    return '#d97706';
  return '#16a34a'; // all welcome / default
};

const MONTHS = ['January','February','March','April','May','June',
  'July','August','September','October','November','December'];
const DOW = ['S','M','T','W','T','F','S'];

// Format a Date as YYYY-MM-DD in LOCAL time (not UTC) — avoids off-by-one
// where toISOString shifts the day for AU/other non-UTC timezones.
const ymd = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export default function CalendarView({ events = [], user, profile, setPage,
  setEditingEvent, handleDelete, handleCopy, savedIds = [], onSaveToggle, onStreamStart, isGuest,
  selectedCity: selectedCityProp, setSelectedCity: setSelectedCityProp }) {

  const [view, setView]     = useState('month'); // 'month' | 'week'
  const [cursor, setCursor] = useState(new Date());
  const [selected, setSelected] = useState(ymd(new Date()));
  const [showSync, setShowSync] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [showHijriDates, setShowHijriDates] = useState(false);
  const [hijriOverrides, setHijriOverrides] = useState([]);
  const selectedCity = normalizeCity(selectedCityProp || profile?.defaultCity || DEFAULT_CITY);
  const setSelectedCity = setSelectedCityProp || (() => {});
  const cityEvents = useMemo(
    () => events.filter(event => normalizeCity(getEventMetroArea(event)) === selectedCity),
    [events, selectedCity]
  );

  useEffect(() => {
    let cancelled = false;
    getHijriSettings()
      .then(settings => {
        if (!cancelled) setHijriOverrides(settings?.overrides || []);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Group events by date for fast lookup
  const byDate = useMemo(() => {
    const map = {};
    cityEvents.forEach(e => {
      if (!e.eventDate) return;
      (map[e.eventDate] = map[e.eventDate] || []).push(e);
    });
    Object.values(map).forEach(dayEvents => dayEvents.sort(compareEventsByDateTime));
    return map;
  }, [cityEvents]);

  // ── Month grid ──
  const monthGrid = useMemo(() => {
    const y = cursor.getFullYear(), m = cursor.getMonth();
    const first = new Date(y, m, 1);
    const startDow = first.getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < startDow; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(y, m, d));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [cursor]);

  // ── Week days ──
  const weekDays = useMemo(() => {
    const base = new Date(cursor);
    base.setDate(base.getDate() - base.getDay()); // Sunday start
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(base); d.setDate(base.getDate() + i); return d;
    });
  }, [cursor]);

  const stepMonth = (n) => { const d = new Date(cursor); d.setMonth(d.getMonth() + n); setCursor(d); };
  const stepWeek  = (n) => { const d = new Date(cursor); d.setDate(d.getDate() + n * 7); setCursor(d); };

  const todayStr = ymd(new Date());
  const selectedEvents = byDate[selected] || [];
  const hijriShort = (date) => {
    const parts = getHijriParts(ymd(date), hijriOverrides);
    if (!parts) return '';
    const month = HIJRI_MONTHS.find(m => Number(m.value) === Number(parts.month))?.name || '';
    return `${parts.day} ${month.slice(0, 3)}`;
  };

  const renderCard = (e) => (
    <EventCard key={e.id} event={e} user={user} profile={profile}
      onEdit={ev => { setEditingEvent(ev); setPage('edit'); }}
      onDelete={handleDelete} onCopy={handleCopy}
      isExpanded={expandedId === e.id}
      onExpand={(id) => setExpandedId(prev => prev === id ? null : id)}
      savedIds={savedIds} onSaveToggle={onSaveToggle} onStreamStart={onStreamStart}
      isGuest={isGuest} />
  );

  // ── Sync sub-view with back button ──
  if (showSync) {
    return (
      <div style={{ padding: '8px 0 16px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'4px 16px 12px' }}>
          <button onClick={() => setShowSync(false)} style={{
            width:40, height:40, borderRadius:12, background:'var(--teal,#0f766e)',
            border:'none', cursor:'pointer', color:'white', fontSize:'1.375rem', fontWeight:800,
            display:'flex', alignItems:'center', justifyContent:'center', lineHeight:1,
            boxShadow:'0 2px 8px rgba(15,118,110,0.3)' }}>‹</button>
          <h2 style={{ margin:0, fontSize:'1.125rem', fontWeight:800 }}>Sync Calendar</h2>
        </div>
        <CalendarSync user={user} />
      </div>
    );
  }

  return (
    <div className="calendar-page" style={{ padding: '8px 0 112px', overflowX: 'hidden' }}>

      {/* Header: title */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'4px 16px 12px' }}>
        <h2 style={{ margin:0, fontSize:'1.125rem', fontWeight:800 }}>Calendar</h2>
      </div>

      <div style={{ padding:'0 16px 12px' }}>
        <CitySelector value={selectedCity} onChange={setSelectedCity} />
      </div>

      {/* Prominent Sync button */}
      <button onClick={() => { if (!isGuest) setShowSync(true); }} disabled={isGuest} style={{
        margin:'0 16px 14px', width:'calc(100% - 32px)',
        background: isGuest ? '#eef4f3' : 'linear-gradient(120deg,#0f766e,#0b5d57)',
        color: isGuest ? 'var(--muted)' : 'white',
        border:'none', borderRadius:14, padding:'13px', cursor: isGuest ? 'not-allowed' : 'pointer',
        fontSize:'0.875rem', fontWeight:800, display:'flex', alignItems:'center',
        justifyContent:'center', gap:8,
        boxShadow: isGuest ? 'none' : '0 4px 14px rgba(15,118,110,0.3)',
        opacity: isGuest ? 0.8 : 1 }}>
        🔄 Sync to My Calendar
      </button>
      {isGuest && (
        <p className="small" style={{
          margin:'-6px 18px 14px',
          color:'var(--muted)',
          fontWeight:700,
          textAlign:'center',
        }}>
          Calendar browsing is available to guests. Sign in to sync it to your device.
        </p>
      )}

      {/* Month / Week toggle */}
      <div style={{ display:'flex', background:'var(--bg,#f4f7f6)', borderRadius:11,
        padding:3, margin:'0 16px 14px' }}>
        {['month','week'].map(v => (
          <button key={v} onClick={() => setView(v)} style={{
            flex:1, textAlign:'center', fontSize:'0.8125rem', fontWeight:700, padding:8,
            borderRadius:8, border:'none', cursor:'pointer',
            background: view===v ? 'white' : 'transparent',
            color: view===v ? 'var(--teal,#0f766e)' : 'var(--muted)',
            boxShadow: view===v ? '0 2px 6px rgba(0,0,0,0.08)' : 'none',
            textTransform:'capitalize' }}>{v}</button>
        ))}
      </div>

      <label style={{
        display:'flex', alignItems:'center', justifyContent:'space-between', gap:12,
        margin:'0 16px 14px', padding:'10px 12px', background:'white',
        border:'1px solid var(--border,#e8edec)', borderRadius:14,
        fontSize:'0.8125rem', fontWeight:800, color:'var(--text)',
      }}>
        <span>Show Hijri dates</span>
        <input
          type="checkbox"
          checked={showHijriDates}
          onChange={e => setShowHijriDates(e.target.checked)}
          style={{ width:20, height:20, accentColor:'var(--teal,#0f766e)' }}
        />
      </label>

      {/* ── MONTH VIEW ── */}
      {view === 'month' && (
        <>
          <div style={{ background:'white', margin:'0 16px 10px', borderRadius:16,
            padding:'12px 10px 18px', border:'1px solid var(--border,#e8edec)',
            boxSizing:'border-box', maxWidth:'calc(100vw - 32px)', overflow:'hidden' }}>
            {/* Month nav */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
              <b style={{ fontSize:'0.9375rem', fontWeight:800 }}>{MONTHS[cursor.getMonth()]} {cursor.getFullYear()}</b>
              <div style={{ display:'flex', gap:6 }}>
                <button onClick={() => stepMonth(-1)} style={navBtn}>‹</button>
                <button onClick={() => stepMonth(1)} style={navBtn}>›</button>
              </div>
            </div>
            {/* DOW header */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(7,minmax(0,1fr))', marginBottom:8 }}>
              {DOW.map((d,i) => <span key={i} style={{ textAlign:'center', fontSize:'0.6875rem',
                fontWeight:800, color:'var(--muted)' }}>{d}</span>)}
            </div>
            {/* Days */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(7,minmax(0,1fr))', gap:5 }}>
              {monthGrid.map((d, i) => {
                if (!d) return <div key={i} style={{ minWidth:0 }} />;
                const ds = ymd(d);
                const evs = byDate[ds] || [];
                const isToday = ds === todayStr;
                const isSel = ds === selected;
                return (
                  <button key={i} onClick={() => setSelected(ds)} style={{
                    minWidth:0, width:'100%', height: showHijriDates ? 56 : 50,
                    minHeight:0, margin:0, padding:'5px 2px 12px',
                    aspectRatio:'auto', borderRadius:10, border:'none', cursor:'pointer',
                    display:'flex', flexDirection:'column', alignItems:'center',
                    justifyContent:'center', gap:3, position:'relative',
                    fontSize: showHijriDates ? '0.9375rem' : '1rem',
                    lineHeight:1, boxSizing:'border-box',
                    fontWeight: isToday || isSel ? 900 : 800,
                    background: isSel ? 'var(--teal,#0f766e)' : isToday ? '#e6f4f1'
                      : evs.length ? '#f0faf8' : 'transparent',
                    color: isSel ? 'white' : 'var(--text)',
                    boxShadow: evs.length ? '0 4px 12px rgba(15,118,110,0.1)' : 'none',
                  }}>
                    <span style={{ lineHeight:1 }}>{d.getDate()}</span>
                    {showHijriDates && (
                      <small style={{
                        fontSize:'0.55rem', lineHeight:1, fontWeight:800,
                        color: isSel ? 'rgba(255,255,255,0.88)' : 'var(--teal,#0f766e)',
                        maxWidth:'100%', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
                      }}>
                        {hijriShort(d)}
                      </small>
                    )}
                    {evs.length > 0 && (
                      <div style={{ display:'flex', gap:3, position:'absolute', bottom:4 }}>
                        {evs.slice(0,3).map((e,j) => (
                          <i key={j} style={{ width:4.5, height:4.5, borderRadius:'50%',
                            background: isSel ? 'white' : dotColor(e.audienceType) }} />
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected day events */}
          <div style={{ padding:'18px 18px 8px', fontSize:'0.75rem', fontWeight:800,
            color:'var(--muted)', position:'relative', zIndex:1, background:'var(--bg,#f4f7f6)' }}>
            {new Date(selected + 'T00:00:00').toLocaleDateString('en-AU',
              { weekday:'long', day:'numeric', month:'long' }).toUpperCase()}
            {' · '}{selectedEvents.length} EVENT{selectedEvents.length !== 1 ? 'S' : ''}
          </div>
          {selectedEvents.length === 0
            ? <p style={{ padding:'4px 18px', color:'var(--muted)', fontSize:'0.8125rem' }}>No events on this day.</p>
            : selectedEvents.map(renderCard)}
        </>
      )}

      {/* ── WEEK VIEW ── */}
      {view === 'week' && (
        <>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
            padding:'0 18px 12px' }}>
            <button onClick={() => stepWeek(-1)} style={navBtn}>‹</button>
            <b style={{ fontSize:'0.875rem', fontWeight:800 }}>
              {weekDays[0].toLocaleDateString('en-AU',{day:'numeric',month:'short'})}
              {' – '}
              {weekDays[6].toLocaleDateString('en-AU',{day:'numeric',month:'short'})}
            </b>
            <button onClick={() => stepWeek(1)} style={navBtn}>›</button>
          </div>

          {weekDays.map((d, i) => {
            const ds = ymd(d);
            const evs = byDate[ds] || [];
            const isWeekend = d.getDay() === 0 || d.getDay() === 6;
            return (
              <div key={i} style={{ padding:'0 16px', marginBottom:4 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 2px 8px' }}>
                  <span style={{ fontSize:'0.8125rem', fontWeight:800,
                    color: isWeekend ? 'var(--teal,#0f766e)' : 'var(--text)' }}>
                    {d.toLocaleDateString('en-AU',{weekday:'short', day:'numeric', month:'short'})}
                  </span>
                  {showHijriDates && (
                    <span style={{ fontSize:'0.625rem', color:'var(--teal,#0f766e)', fontWeight:800 }}>
                      {hijriShort(d)}
                    </span>
                  )}
                  <span style={{ fontSize:'0.625rem', color:'var(--muted)' }}>
                    · {evs.length ? `${evs.length} event${evs.length!==1?'s':''}` : 'No events'}
                    {isWeekend && evs.length ? ' · weekend' : ''}
                  </span>
                </div>
                {evs.map(renderCard)}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

const navBtn = {
  width:40, height:40, borderRadius:12, background:'var(--teal,#0f766e)',
  border:'none', cursor:'pointer', fontSize:'1.375rem', fontWeight:800, color:'white',
  display:'flex', alignItems:'center', justifyContent:'center', lineHeight:1,
  boxShadow:'0 2px 8px rgba(15,118,110,0.3)',
};
