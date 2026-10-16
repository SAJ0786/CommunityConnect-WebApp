import React, { useMemo, useState } from 'react';
import {
  CalendarDays, CalendarOff, CalendarRange, ChevronLeft, ChevronRight,
  Grid2X2, LayoutDashboard, Plus, Search, X,
} from 'lucide-react';
import EventQuickAccess from './EventQuickAccess';
import EventCard from './EventCard';
import EventFilters from './EventFilters';
import EventMapView from './EventMapView';
import { compareEventsByDateTime, todayLocal } from '../services/dateUtils';
import CitySelector from './CitySelector';

const LAYOUTS = [
  { id: 'dashboard', Icon: LayoutDashboard, label: 'Dashboard' },
  { id: 'grid', Icon: Grid2X2, label: 'Event grid' },
  { id: 'calendar', Icon: CalendarRange, label: 'Calendar split' },
];

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const ymd = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

function LayoutSwitcher({ value, onChange }) {
  return (
    <div className="desktop-layout-switcher" aria-label="Choose event layout">
      {LAYOUTS.map(layout => (
        <button key={layout.id} onClick={() => onChange(layout.id)}
          className={value === layout.id ? 'active' : ''}
          title={`${layout.label} layout`} aria-pressed={value === layout.id}>
          <layout.Icon size={17} strokeWidth={2} />
          <span>{layout.label}</span>
        </button>
      ))}
    </div>
  );
}

function TodayRail({ events, setExpandedId, setPage, isGuest }) {
  const today = todayLocal();
  const todaysEvents = events
    .filter(event => event.eventDate === today || event.isLive)
    .sort(compareEventsByDateTime);

  return (
    <aside className="desktop-today-rail">
      <div className="desktop-rail-heading">
        <div>
          <span>Today</span>
          <small>{new Date(`${today}T12:00:00`).toLocaleDateString('en-AU', {
            weekday: 'long', day: 'numeric', month: 'long',
          })}</small>
        </div>
        <span className="desktop-count">{todaysEvents.length}</span>
      </div>
      <div className="desktop-agenda-list">
        {todaysEvents.length === 0 && <p>No events scheduled today.</p>}
        {todaysEvents.slice(0, 7).map(event => (
          <button key={event.id} onClick={() => setExpandedId(event.id)}>
            <span className={event.isLive ? 'agenda-dot live' : 'agenda-dot'} />
            <span>
              <strong>{event.startTime || 'All day'}</strong>
              <b>{event.eventTypeDisplay || event.eventType} - {event.hostName}</b>
              <small>{event.address?.suburb || event.suburb || ''}</small>
            </span>
          </button>
        ))}
      </div>
      <div className="desktop-rail-actions">
        {!isGuest && <button onClick={() => setPage('add')}><Plus size={15} /> Add Event</button>}
        <button className="secondary" data-walkthrough-target="bottom-calendar" onClick={() => setPage('calendar')}>
          <CalendarDays size={15} /> View Calendar &amp; Sync
        </button>
      </div>
    </aside>
  );
}

function MonthPanel({ events, selected, onSelect }) {
  const [cursor, setCursor] = useState(() => new Date(`${selected}T12:00:00`));
  const eventDates = useMemo(() => new Set(events.map(event => event.eventDate)), [events]);
  const cells = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const first = new Date(year, month, 1);
    const mondayOffset = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const output = Array(mondayOffset).fill(null);
    for (let day = 1; day <= daysInMonth; day += 1) output.push(new Date(year, month, day));
    while (output.length % 7) output.push(null);
    return output;
  }, [cursor]);

  const moveMonth = (amount) => {
    setCursor(current => new Date(current.getFullYear(), current.getMonth() + amount, 1));
  };

  return (
    <section className="desktop-month-panel">
      <div className="month-heading">
        <h3>{MONTHS[cursor.getMonth()]} {cursor.getFullYear()}</h3>
        <div>
          <button onClick={() => moveMonth(-1)} aria-label="Previous month"><ChevronLeft size={17} /></button>
          <button onClick={() => moveMonth(1)} aria-label="Next month"><ChevronRight size={17} /></button>
        </div>
      </div>
      <div className="month-weekdays">{DAYS.map(day => <span key={day}>{day}</span>)}</div>
      <div className="month-grid">
        {cells.map((date, index) => {
          if (!date) return <span key={`blank-${index}`} />;
          const dateString = ymd(date);
          const isSelected = dateString === selected;
          const hasEvents = eventDates.has(dateString);
          return (
            <button key={dateString} onClick={() => onSelect(dateString)}
              className={`${isSelected ? 'selected ' : ''}${hasEvents ? 'has-events' : ''}`.trim()}>
              {date.getDate()}
              {hasEvents && <i />}
            </button>
          );
        })}
      </div>
    </section>
  );
}

export default function DesktopHome({
  events, mapEvents = events, displayed, totalCount, hasMore, onLoadMore, filterableEvents, filtered, setFiltered, query, setQuery,
  expandedId, setExpandedId, user, profile, setPage,
  setEditingEvent, handleDelete, handleCopy, isGuest, savedIds, onSaveToggle,
  onStreamStart, selectedCity, onCityChange, viewMode = 'list', setViewMode,
  onSelectMapEvent, browseControls, browseRevision = 0, registrationOnly, onRegistrationOnly,
}) {
  const [layout, setLayout] = useState(() => {
    try { return localStorage.getItem('communityEventsDesktopLayout') || 'grid'; }
    catch { return 'grid'; }
  });
  const [selectedDate, setSelectedDate] = useState(todayLocal());

  const selectLayout = (nextLayout) => {
    setLayout(nextLayout);
    try { localStorage.setItem('communityEventsDesktopLayout', nextLayout); } catch {}
  };

  const selectedEvents = displayed
    .filter(event => event.eventDate === selectedDate || event.isLive)
    .sort(compareEventsByDateTime);
  const groupedEvents = useMemo(() => {
    const groups = [];
    displayed.forEach(event => {
      let group = groups.find(item => item.date === event.eventDate);
      if (!group) {
        group = { date: event.eventDate, events: [] };
        groups.push(group);
      }
      group.events.push(event);
    });
    groups.forEach(group => group.events.sort(compareEventsByDateTime));
    return groups;
  }, [displayed]);

  const renderEvent = (event, index = 0) => (
    <div id={`event-${event.id}`} key={event.id} className="desktop-event-cell">
      <EventCard event={event} user={user} profile={profile}
        onEdit={item => { setEditingEvent(item); setPage('edit'); }}
        onDelete={handleDelete} onCopy={handleCopy} isGuest={isGuest}
        isExpanded={expandedId === event.id || (expandedId === '__first__' && index === 0)}
        onExpand={id => setExpandedId(id)} savedIds={savedIds}
        onSaveToggle={isGuest ? null : onSaveToggle} onStreamStart={onStreamStart} onCalendar={() => setPage('calendar')}
        imagePriority={event.id === displayed[0]?.id} />
    </div>
  );

  return (
    <div className={`desktop-home desktop-home-${layout}`}>
      <div className="desktop-home-toolbar">
        <div data-walkthrough-target="city-and-view">
          <CitySelector value={selectedCity} onChange={onCityChange} compact />
        </div>

        <div className="desktop-search" data-walkthrough-target="bottom-search">
          <Search size={19} />
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search events..." />
          {query && <button onClick={() => setQuery('')} aria-label="Clear search"><X size={16} /></button>}
        </div>
        <LayoutSwitcher value={layout} onChange={selectLayout} />
      </div>

      <div className="desktop-title-row">
        <div>
          <h1>Events</h1>
          <p>{totalCount} event{totalCount === 1 ? '' : 's'} available</p>
        </div>
      </div>

      <EventQuickAccess viewMode={viewMode} setViewMode={setViewMode} setPage={setPage} isGuest={isGuest} registrationOnly={registrationOnly} onRegistrationOnly={onRegistrationOnly}/>
      {browseControls}

      <EventFilters key={selectedCity + browseRevision} events={filterableEvents} onChange={setFiltered}
        upcomingOnlyOnEmpty variant="toolbar" filtered={filtered} />

      <div className="desktop-notice">
        <span>Moon sighting may affect Hijri dates.</span>
        <span>Events are user-submitted; verify details with the host.</span>
      </div>

      {viewMode === 'map' && !isGuest ? (
        <EventMapView events={mapEvents} onSelectEvent={onSelectMapEvent} />
      ) : displayed.length === 0 ? (
        <div className="desktop-empty">
          <CalendarOff size={42} />
          <h3>No matching events</h3>
          <p>Try clearing a filter or using a different search.</p>
        </div>
      ) : layout === 'grid' ? (
        <div className="desktop-grid-layout">
          <main className="desktop-event-grid">{displayed.map(renderEvent)}</main>
          <TodayRail events={events} setExpandedId={setExpandedId} setPage={setPage} isGuest={isGuest} />
        </div>
      ) : layout === 'calendar' ? (
        <div className="desktop-calendar-layout">
          <main className="desktop-agenda-groups">
            {groupedEvents.slice(0, 14).map(group => (
              <section key={group.date}>
                <h2>{new Date(`${group.date}T12:00:00`).toLocaleDateString('en-AU', {
                  weekday: 'long', day: 'numeric', month: 'long',
                })}</h2>
                {group.events.map(renderEvent)}
              </section>
            ))}
          </main>
          <aside className="desktop-calendar-side">
            <MonthPanel events={events} selected={selectedDate} onSelect={setSelectedDate} />
            <div className="selected-day-panel">
              <h3>Selected day <span>{selectedEvents.length}</span></h3>
              {selectedEvents.length === 0 && <p>No events on this date.</p>}
              {selectedEvents.slice(0, 4).map(event => (
                <button key={event.id} onClick={() => setExpandedId(event.id)}>
                  <strong>{event.startTime}</strong>
                  <span>{event.eventTypeDisplay || event.eventType} - {event.hostName}</span>
                </button>
              ))}
            </div>
          </aside>
        </div>
      ) : (
        <div className="desktop-dashboard-layout">
          <main className="desktop-event-list">{displayed.map(renderEvent)}</main>
          <TodayRail events={events} setExpandedId={setExpandedId} setPage={setPage} isGuest={isGuest} />
        </div>
      )}
      {viewMode !== 'map' && hasMore && (
        <button className="desktop-load-more" onClick={onLoadMore}>Show more events</button>
      )}
    </div>
  );
}
