import React, { useState, useMemo } from 'react';
import { Building2, CalendarDays, MapPin, Tag, UserRound, Users, X } from 'lucide-react';
import { localDateStr } from '../services/dateUtils';

const FILTER_STYLE = {
  background: 'var(--card,white)',
  border: '1px solid var(--border,#d1d5db)',
  borderRadius: 10, padding: '6px 10px',
  fontSize: '0.8125rem', color: 'var(--text,#1f2937)',
  cursor: 'pointer', outline: 'none',
};

export default function EventFilters({ events, onChange, upcomingOnlyOnEmpty = false, variant = 'panel' }) {
  const [organiser,    setOrganiser]    = useState('');
  const [suburb,       setSuburb]       = useState('');
  const [hostName,     setHostName]     = useState('');
  const [period,       setPeriod]       = useState('');
  const [audienceType, setAudienceType] = useState('');
  const [eventType,    setEventType]    = useState('');
  const [liveOnly,     setLiveOnly]     = useState(false);
  const [sortBy,       setSortBy]       = useState('date');
  const [open,         setOpen]         = useState(false);

  const suburbs   = useMemo(() => [...new Set(events.map(e => e.address?.suburb).filter(Boolean))].sort(), [events]);
  const hostNames = useMemo(() => [...new Set(events.map(e => e.hostName).filter(Boolean))].sort(), [events]);
  const eventTypes = useMemo(() => [...new Set(events
    .map(e => e.eventTypeDisplay || e.customEventType || e.eventType)
    .filter(Boolean))].sort((a, b) => a.localeCompare(b)), [events]);

  const today    = localDateStr();
  const yesterday = localDateStr(-1);
  const weekEnd  = localDateStr(7);
  const monthEnd = localDateStr(30);

  // Count live events for badge
  const liveCount = useMemo(() => events.filter(e => e.isLive).length, [events]);

  const apply = (overrides = {}) => {
    const o  = overrides.organiser    ?? organiser;
    const s  = overrides.suburb       ?? suburb;
    const h  = overrides.hostName     ?? hostName;
    const p  = overrides.period       ?? period;
    const at = overrides.audienceType ?? audienceType;
    const et = overrides.eventType    ?? eventType;
    const lo = overrides.liveOnly     ?? liveOnly;
    const sb = overrides.sortBy       ?? sortBy;

    let filtered = [...events];

    if (lo)  filtered = filtered.filter(e => e.isLive);
    if (o)   filtered = filtered.filter(e => e.organiserType === o);
    if (s)   filtered = filtered.filter(e => e.address?.suburb === s);
    if (h)   filtered = filtered.filter(e => e.hostName === h);
    if (et)  filtered = filtered.filter(e => (e.eventTypeDisplay || e.customEventType || e.eventType) === et);
    if (at)  filtered = filtered.filter(e => {
      const stored = e.audienceType || '';
      // "Family Event" and legacy "Mixed Audience" are the same — match both
      if (at === 'Family Event') return stored === 'Family Event' || stored === 'Mixed Audience';
      if (at === 'Mixed Audience') return stored === 'Family Event' || stored === 'Mixed Audience';
      return stored === at;
    });
    // Never strand a host when a live stream crosses midnight. Active streams
    // remain visible until they are explicitly ended.
    if (!p && upcomingOnlyOnEmpty) filtered = filtered.filter(e => e.isLive || e.eventDate >= today);
    if (p === 'yesterday') filtered = filtered.filter(e => e.eventDate === yesterday);
    if (p === 'today')  filtered = filtered.filter(e => e.isLive || e.eventDate === today);
    if (p === 'week')   filtered = filtered.filter(e => e.isLive || (e.eventDate >= today && e.eventDate <= weekEnd));
    if (p === 'month')  filtered = filtered.filter(e => e.isLive || (e.eventDate >= today && e.eventDate <= monthEnd));

    filtered.sort((a, b) => {
      // Live events always first regardless of sort
      if (a.isLive && !b.isLive) return -1;
      if (!a.isLive && b.isLive) return 1;
      if (sb === 'added') {
        const ta = a.createdAt?.toDate?.()?.getTime() || 0;
        const tb = b.createdAt?.toDate?.()?.getTime() || 0;
        return tb - ta;
      }
      if (sb === 'live') return 0; // already sorted above
      return (a.eventDate || '').localeCompare(b.eventDate || '');
    });

    onChange(filtered);
  };

  const set = (key, val, setter) => { setter(val); apply({ [key]: val }); };

  const toggleLive = () => {
    const newVal = !liveOnly;
    setLiveOnly(newVal);
    apply({ liveOnly: newVal });
  };

  const reset = () => {
    setOrganiser(''); setSuburb(''); setHostName(''); setPeriod('');
    setAudienceType(''); setEventType(''); setLiveOnly(false); setSortBy('date');
    onChange(null);
  };

  const activeCount = [organiser, suburb, hostName, period, audienceType, eventType].filter(Boolean).length + (liveOnly ? 1 : 0);

  if (variant === 'toolbar') {
    return (
      <div className="desktop-filter-toolbar">
        <div className="desktop-filter-fields">
          <label>
            <CalendarDays size={15} />
            <select value={period} onChange={e => set('period', e.target.value, setPeriod)}>
              <option value="">All upcoming</option>
              <option value="yesterday">Yesterday</option>
              <option value="today">Today</option>
              <option value="week">This week</option>
              <option value="month">This month</option>
            </select>
          </label>
          <label>
            <Tag size={15} />
            <select value={eventType} onChange={e => set('eventType', e.target.value, setEventType)}>
              <option value="">All event types</option>
              {eventTypes.map(item => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label>
            <Users size={15} />
            <select value={audienceType} onChange={e => set('audienceType', e.target.value, setAudienceType)}>
              <option value="">All audiences</option>
              <option value="Gents only">Gents only</option>
              <option value="Ladies only">Ladies only</option>
              <option value="Kids only">Kids only</option>
              <option value="Family Event">Family Event</option>
            </select>
          </label>
          <label>
            <MapPin size={15} />
            <select value={suburb} onChange={e => set('suburb', e.target.value, setSuburb)}>
              <option value="">All suburbs</option>
              {suburbs.map(item => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label>
            <Building2 size={15} />
            <select value={organiser} onChange={e => set('organiser', e.target.value, setOrganiser)}>
              <option value="">All organiser types</option>
              <option value="centre">Centre</option>
              <option value="private">Private</option>
            </select>
          </label>
          <label className="desktop-more-filter">
            <UserRound size={15} />
            <select value={hostName} onChange={e => set('hostName', e.target.value, setHostName)}>
              <option value="">All hosts</option>
              {hostNames.map(item => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
        </div>
        <div className="desktop-filter-actions">
          {liveCount > 0 && (
            <button onClick={toggleLive} className={liveOnly ? 'active-live' : ''}>
              <span /> Live {liveCount}
            </button>
          )}
          {activeCount > 0 && <button onClick={reset} className="clear-filters"><X size={14} /> Clear</button>}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '0 16px 8px' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>

        {/* Filters toggle — takes remaining space */}
        <button onClick={() => setOpen(o => !o)}
          className={activeCount ? '' : 'btn-light'}
          style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            borderRadius: 10, padding: '7px 12px', fontSize: '0.8125rem', cursor: 'pointer',
          }}>
          <i className="ti ti-adjustments-horizontal" style={{ fontSize: '0.9375rem' }} />
          Filters {activeCount > 0 && `(${activeCount})`}
          <i className={`ti ti-chevron-${open ? 'up' : 'down'}`} style={{ fontSize: '0.8125rem' }} />
        </button>

        {/* Live filter — right side */}
        {liveCount > 0 ? (
          <button onClick={toggleLive}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              borderRadius: 10, padding: '7px 12px', fontSize: '0.8125rem',
              cursor: 'pointer', border: 'none', fontWeight: liveOnly ? 900 : 600,
              background: liveOnly ? '#fee2e2' : 'var(--card,white)',
              color: liveOnly ? '#dc2626' : 'var(--text)',
              boxShadow: liveOnly ? '0 0 0 2px #dc2626' : '0 0 0 1px var(--border)',
              whiteSpace: 'nowrap',
            }}>
            <span style={{ animation: 'liveBlink 1s infinite', fontSize: '0.625rem' }}>🔴</span>
            Live ({liveCount})
          </button>
        ) : (
          activeCount > 0 && (
            <button onClick={reset} style={{ ...FILTER_STYLE, color: '#dc2626', borderColor: '#fecaca' }}>
              ✕
            </button>
          )
        )}

        {/* Clear — only shows when live button is also showing */}
        {liveCount > 0 && activeCount > 0 && (
          <button onClick={reset} style={{ ...FILTER_STYLE, color: '#dc2626', borderColor: '#fecaca', padding: '6px 8px' }}>
            ✕
          </button>
        )}
      </div>

      {/* Filter panel */}
      {open && (
        <div style={{
          marginTop: 8, padding: 12, background: 'var(--card,white)',
          border: '1px solid var(--border,#d1d5db)', borderRadius: 12,
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8,
        }}>
          {/* Organiser type */}
          <div>
            <label style={{ fontSize: '0.6875rem', color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Organiser type</label>
            <select value={organiser} onChange={e => set('organiser', e.target.value, setOrganiser)} style={{ ...FILTER_STYLE, width: '100%' }}>
              <option value="">All</option>
              <option value="centre">Centre</option>
              <option value="private">Private</option>
            </select>
          </div>

          {/* Event type, including user-entered custom types */}
          <div>
            <label style={{ fontSize: '0.6875rem', color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Event type</label>
            <select value={eventType} onChange={e => set('eventType', e.target.value, setEventType)} style={{ ...FILTER_STYLE, width: '100%' }}>
              <option value="">All event types</option>
              {eventTypes.map(item => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>

          {/* Audience type */}
          <div>
            <label style={{ fontSize: '0.6875rem', color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Audience type</label>
            <select value={audienceType} onChange={e => set('audienceType', e.target.value, setAudienceType)} style={{ ...FILTER_STYLE, width: '100%' }}>
              <option value="">All audiences</option>
              <option value="Gents only">Gents only</option>
              <option value="Ladies only">Ladies only</option>
              <option value="Kids only">Kids only</option>
              <option value="Family Event">Family Event</option>
            </select>
          </div>

          {/* Period */}
          <div>
            <label style={{ fontSize: '0.6875rem', color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Time period</label>
            <select value={period} onChange={e => set('period', e.target.value, setPeriod)} style={{ ...FILTER_STYLE, width: '100%' }}>
              <option value="">All upcoming</option>
              <option value="yesterday">Yesterday</option>
              <option value="today">Today</option>
              <option value="week">This week</option>
              <option value="month">This month</option>
            </select>
          </div>

          {/* Host name */}
          <div>
            <label style={{ fontSize: '0.6875rem', color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Host name</label>
            <select value={hostName} onChange={e => set('hostName', e.target.value, setHostName)} style={{ ...FILTER_STYLE, width: '100%' }}>
              <option value="">All hosts</option>
              {hostNames.map(h => <option key={h} value={h}>{h}</option>)}
            </select>
          </div>

          {/* Suburb */}
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ fontSize: '0.6875rem', color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Suburb</label>
            <select value={suburb} onChange={e => set('suburb', e.target.value, setSuburb)} style={{ ...FILTER_STYLE, width: '100%' }}>
              <option value="">All suburbs</option>
              {suburbs.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
      )}

      <style>{`@keyframes liveBlink{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
    </div>
  );
}
