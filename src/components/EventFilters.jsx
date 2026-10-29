import React, { useState, useMemo } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import CitySelector from './CitySelector';
import '../styles/browse.css';
import { availableEventTypes, eventBrowseType } from '../utils/eventBrowseTypes.mjs';
import { compareEventsByDateTime, localDateStr } from '../services/dateUtils';

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
  const eventTypes = useMemo(() => availableEventTypes(events).sort((a, b) => a.localeCompare(b)), [events]);

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

    const select = source => {
      const today = localDateStr(), yesterday = localDateStr(-1), weekEnd = localDateStr(7), monthEnd = localDateStr(30);
      let filtered = [...source];

      if (lo)  filtered = filtered.filter(e => e.isLive);
      if (o)   filtered = filtered.filter(e => e.organiserType === o);
      if (s)   filtered = filtered.filter(e => e.address?.suburb === s);
      if (h)   filtered = filtered.filter(e => e.hostName === h);
      if (et)  filtered = filtered.filter(e => eventBrowseType(e) === et);
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
        return compareEventsByDateTime(a, b);
      });

      return filtered;
    };
    onChange(select(events), select);
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

  const choices = (label, value, setter, key, options) => <label className="native-filter-field">
    <span>{label}</span>
    <CitySelector label={label} value={value} onChange={next => set(key, next, setter)} showPin={false} options={options} />
  </label>;
  const option = (value, label = value) => ({ value, label });
  const panel = <section className="native-filter-panel" aria-label="Customised filters">
    <div className="native-filter-heading"><h3>Customised filters</h3>
      <button type="button" onClick={reset} disabled={!activeCount} aria-label="Clear Filters"><X size={15} /> Clear Filters</button>
    </div>
    <div className="native-filter-grid">
      {choices('Event type', eventType, setEventType, 'eventType', [option('', 'All event types'), ...eventTypes.map(value => option(value))])}
      {choices('Audience type', audienceType, setAudienceType, 'audienceType', [option('', 'All audiences'), ...['Gents only', 'Ladies only', 'Kids only', 'Family Event'].map(value => option(value))])}
      {choices('Organiser type', organiser, setOrganiser, 'organiser', [option('', 'All'), option('centre', 'Centre'), option('private', 'Private')])}
      {choices('Host name', hostName, setHostName, 'hostName', [option('', 'All hosts'), ...hostNames.map(value => option(value))])}
      {choices('Suburb', suburb, setSuburb, 'suburb', [option('', 'All suburbs'), ...suburbs.map(value => option(value))])}
      {choices('Time period', period, setPeriod, 'period', [option('', 'All upcoming'), option('yesterday', 'Yesterday'), option('today', 'Today'), option('week', 'Next 7 days'), option('month', 'Next 30 days')])}
    </div>
    {liveCount > 0 && <button type="button" className="native-live-filter" onClick={toggleLive} aria-pressed={liveOnly}>Live ({liveCount})</button>}
  </section>;
  return <div className={variant === 'toolbar' ? 'native-filter-desktop' : 'native-filter-mobile'}>
    {variant === 'toolbar' && <button type="button" className="native-filter-toggle" onClick={() => setOpen(value => !value)} aria-expanded={open}>
      <SlidersHorizontal size={18} /> Filters{activeCount > 0 ? ' (' + activeCount + ')' : ''}
    </button>}
    {(variant !== 'toolbar' || open) && panel}
  </div>;
}
