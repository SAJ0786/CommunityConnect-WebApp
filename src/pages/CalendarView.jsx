import React, { useState, useMemo } from 'react';
import EventCard from '../components/EventCard';
import CalendarSync from './CalendarSync';

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
  setEditingEvent, handleDelete, handleCopy, savedIds = [], onSaveToggle, onStreamStart }) {

  const [view, setView]     = useState('month'); // 'month' | 'week'
  const [cursor, setCursor] = useState(new Date());
  const [selected, setSelected] = useState(ymd(new Date()));
  const [showSync, setShowSync] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

  // Group events by date for fast lookup
  const byDate = useMemo(() => {
    const map = {};
    events.forEach(e => {
      if (!e.eventDate) return;
      (map[e.eventDate] = map[e.eventDate] || []).push(e);
    });
    return map;
  }, [events]);

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

  const renderCard = (e) => (
    <EventCard key={e.id} event={e} user={user} profile={profile}
      onEdit={ev => { setEditingEvent(ev); setPage('edit'); }}
      onDelete={handleDelete} onCopy={handleCopy}
      isExpanded={expandedId === e.id}
      onExpand={(id) => setExpandedId(prev => prev === id ? null : id)}
      savedIds={savedIds} onSaveToggle={onSaveToggle} onStreamStart={onStreamStart} />
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
    <div className="calendar-page" style={{ padding: '8px 0 16px' }}>

      {/* Header: title */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'4px 16px 12px' }}>
        <h2 style={{ margin:0, fontSize:'1.125rem', fontWeight:800 }}>Calendar</h2>
      </div>

      {/* Prominent Sync button */}
      <button onClick={() => setShowSync(true)} style={{
        margin:'0 16px 14px', width:'calc(100% - 32px)',
        background:'linear-gradient(120deg,#0f766e,#0b5d57)', color:'white',
        border:'none', borderRadius:14, padding:'13px', cursor:'pointer',
        fontSize:'0.875rem', fontWeight:800, display:'flex', alignItems:'center',
        justifyContent:'center', gap:8, boxShadow:'0 4px 14px rgba(15,118,110,0.3)' }}>
        🔄 Sync to My Calendar
      </button>

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

      {/* ── MONTH VIEW ── */}
      {view === 'month' && (
        <>
          <div style={{ background:'white', margin:'0 16px', borderRadius:16,
            padding:14, border:'1px solid var(--border,#e8edec)' }}>
            {/* Month nav */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
              <b style={{ fontSize:'0.9375rem', fontWeight:800 }}>{MONTHS[cursor.getMonth()]} {cursor.getFullYear()}</b>
              <div style={{ display:'flex', gap:6 }}>
                <button onClick={() => stepMonth(-1)} style={navBtn}>‹</button>
                <button onClick={() => stepMonth(1)} style={navBtn}>›</button>
              </div>
            </div>
            {/* DOW header */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', marginBottom:6 }}>
              {DOW.map((d,i) => <span key={i} style={{ textAlign:'center', fontSize:'0.5625rem',
                fontWeight:800, color:'var(--muted)' }}>{d}</span>)}
            </div>
            {/* Days */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:2 }}>
              {monthGrid.map((d, i) => {
                if (!d) return <div key={i} />;
                const ds = ymd(d);
                const evs = byDate[ds] || [];
                const isToday = ds === todayStr;
                const isSel = ds === selected;
                return (
                  <button key={i} onClick={() => setSelected(ds)} style={{
                    aspectRatio:'1', borderRadius:9, border:'none', cursor:'pointer',
                    display:'flex', flexDirection:'column', alignItems:'center',
                    justifyContent:'center', gap:2, position:'relative', fontSize:'0.6875rem',
                    fontWeight: isToday ? 800 : 600,
                    background: isSel ? 'var(--teal,#0f766e)' : isToday ? '#e6f4f1'
                      : evs.length ? '#f0faf8' : 'transparent',
                    color: isSel ? 'white' : 'var(--text)',
                  }}>
                    {d.getDate()}
                    {evs.length > 0 && (
                      <div style={{ display:'flex', gap:2, position:'absolute', bottom:4 }}>
                        {evs.slice(0,3).map((e,j) => (
                          <i key={j} style={{ width:4, height:4, borderRadius:'50%',
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
          <div style={{ padding:'16px 18px 6px', fontSize:'0.75rem', fontWeight:800, color:'var(--muted)' }}>
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
