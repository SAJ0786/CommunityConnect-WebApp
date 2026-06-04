import React, { useEffect, useMemo, useState } from 'react';
import EventCard from '../components/EventCard';
import { distanceKm, getCurrentPosition } from '../services/geoService';
import { EVENT_TYPES } from '../utils/constants';

function getWeekend() {
  const n = new Date(), day = n.getDay();
  const sat = new Date(n);
  sat.setDate(n.getDate() + ((6 - day + 7) % 7));
  const sun = new Date(sat);
  sun.setDate(sat.getDate() + 1);
  return [sat.toISOString().slice(0, 10), sun.toISOString().slice(0, 10)];
}

export default function SearchEvents({ events, user, profile, setPage, setEditingEvent, handleDelete, preset }) {
  const [filters, setFilters] = useState({ from: '', to: '', host: '', suburb: '', eventType: 'All' });
  const [nearby, setNearby]   = useState(false);
  const [pos, setPos]         = useState(null);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    if (preset === 'today') {
      setFilters(f => ({ ...f, from: today, to: today }));
    } else if (preset === 'week') {
      const end = new Date(); end.setDate(end.getDate() + 7);
      setFilters(f => ({ ...f, from: today, to: end.toISOString().slice(0, 10) }));
    } else if (preset === 'weekend') {
      const [sat, sun] = getWeekend();
      setFilters(f => ({ ...f, from: sat, to: sun }));
    } else if (preset === 'nearby') {
      setNearby(true);
      getCurrentPosition().then(setPos).catch(e => alert(e.message));
    }
  }, [preset]);

  const filtered = useMemo(() => events.filter(e => {
    if (filters.from && e.eventDate < filters.from) return false;
    if (filters.to   && e.eventDate > filters.to)   return false;
    if (filters.host   && !e.hostName?.toLowerCase().includes(filters.host.toLowerCase()))     return false;
    if (filters.suburb && !e.address?.suburb?.toLowerCase().includes(filters.suburb.toLowerCase())) return false;
    if (filters.eventType !== 'All' && e.eventType !== filters.eventType) return false;
    if (nearby && pos) {
      const km = distanceKm(pos.latitude, pos.longitude, e.address?.latitude, e.address?.longitude);
      if (km === null || km > 10) return false;
    }
    return true;
  }), [events, filters, nearby, pos]);

  const set = patch => setFilters(f => ({ ...f, ...patch }));

  return (
    <>
      <div className="card">
        <h2>Search Events</h2>

        <div className="row">
          <div>
            <label>From</label>
            <input type="date" value={filters.from} onChange={e => set({ from: e.target.value })} />
          </div>
          <div>
            <label>To</label>
            <input type="date" value={filters.to} onChange={e => set({ to: e.target.value })} />
          </div>
        </div>

        <div className="row">
          <div>
            <label>Host Name</label>
            <input value={filters.host} onChange={e => set({ host: e.target.value })} />
          </div>
          <div>
            <label>Suburb</label>
            <input value={filters.suburb} onChange={e => set({ suburb: e.target.value })} />
          </div>
        </div>

        <label>Event Type</label>
        <select value={filters.eventType} onChange={e => set({ eventType: e.target.value })}>
          <option>All</option>
          {EVENT_TYPES.map(t => <option key={t}>{t}</option>)}
        </select>

        <label className="checkbox">
          <input
            type="checkbox"
            checked={nearby}
            onChange={async e => {
              setNearby(e.target.checked);
              if (e.target.checked && !pos) {
                try { setPos(await getCurrentPosition()); }
                catch (err) { alert(err.message); }
              }
            }}
          />
          <span>Show events within 10km of my location</span>
        </label>
      </div>

      <div className="card">
        <b>{filtered.length}</b> event(s) found
      </div>

      {filtered.map(e => (
        <EventCard
          key={e.id}
          event={e}
          user={user}
          profile={profile}
          onEdit={ev => { setEditingEvent(ev); setPage('edit'); }}
          onDelete={handleDelete}
        />
      ))}
    </>
  );
}
