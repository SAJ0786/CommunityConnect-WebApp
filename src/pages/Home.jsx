import React, { lazy, Suspense, useState, useEffect, useRef } from 'react';
import EventQuickAccess from '../components/EventQuickAccess';
import EventCard from '../components/EventCard';
import EventFilters from '../components/EventFilters';
import { compareEventsByDateTime, localDateStr, todayLocal } from '../services/dateUtils';
import CitySelector from '../components/CitySelector';
import EventBrowseControls from '../components/EventBrowseControls';
import { coordinates, distanceKm, matchesEventPeriod } from '../utils/browseFilters.mjs';
import { eventBrowseType } from '../utils/eventBrowseTypes.mjs';
import { DEFAULT_CITY, getEventMetroArea, normalizeCity } from '../utils/cities';

const DesktopHome = lazy(() => import('../components/DesktopHome'));
const EventMapView = lazy(() => import('../components/EventMapView'));

export default function Home({ events, user, profile, setPage, setEditingEvent,
  handleDelete, handleCopy, isGuest = false, loadEvents,
  savedIds = [], onSaveToggle, onStreamStart, focusEventId, setFocusEventId,
  eventsLoading = false, offlineMode = false, selectedCity: selectedCityProp,
  setSelectedCity: setSelectedCityProp }) {

  const today    = todayLocal();
  const yesterday = localDateStr(-1);
  const [filtered,   setFiltered]   = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [visibleCount, setVisibleCount] = useState(12);
  const [query,      setQuery]      = useState('');
  const [registrationOnly, setRegistrationOnly] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [browsePeriod, setBrowsePeriod] = useState('');
  const [browseCategory, setBrowseCategory] = useState('');
  const [browseRevision, setBrowseRevision] = useState(0);
  const [location, setLocation] = useState(null);
  const [locationNote, setLocationNote] = useState('');
  const locationRequest = useRef(0);
  useEffect(() => () => { locationRequest.current += 1; }, []);
  const resetAdvanced = () => { setFiltered(null); setBrowseRevision(value => value + 1); };
  const toggleRegistrationOnly = value => { setRegistrationOnly(value); resetAdvanced(); };
  const choosePeriod = value => {
    const request = ++locationRequest.current;
    setLocationNote('');
    if (value !== 'nearby') {
      setBrowsePeriod(value); resetAdvanced();
      if (!value) setBrowseCategory('');
      return;
    }
    if (!cityEvents.some(event => coordinates(event.address))) {
      setLocationNote(isGuest ? 'Sign in to browse events by distance.' : 'These events do not have locations available for distance sorting.');
      return;
    }
    if (!navigator.geolocation) { setLocationNote('Location is unavailable in this browser. Choose a city instead.'); return; }
    setLocationNote('Waiting for your location permission…');
    navigator.geolocation.getCurrentPosition(position => {
      if (request !== locationRequest.current) return;
      setLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude });
      setBrowsePeriod('nearby'); resetAdvanced();
      setLocationNote('Nearest events first in your selected city. Events without a location appear last.');
    }, () => {
      if (request === locationRequest.current) setLocationNote('Location could not be accessed. Allow location access or choose a city instead.');
    }, { timeout: 10000, maximumAge: 300000 });
  };
  const chooseCategory = value => { setBrowseCategory(value); resetAdvanced(); };
  const applyAdvanced = rows => {
    locationRequest.current += 1;
    setFiltered(rows); setBrowsePeriod(''); setBrowseCategory(''); setLocationNote('');
  };
  const selectedCity = normalizeCity(selectedCityProp || profile?.defaultCity || DEFAULT_CITY);
  const setSelectedCity = setSelectedCityProp || (() => {});
  const [viewMode, setViewMode] = useState('list');
  const [wideLayout, setWideLayout] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia?.('(min-width: 700px) and (min-height: 600px)').matches
  ));

  useEffect(() => {
    const media = window.matchMedia?.('(min-width: 700px) and (min-height: 600px)');
    if (!media) return undefined;
    const update = event => setWideLayout(event.matches);
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);

  useEffect(() => {
    setFiltered(null);
    setBrowsePeriod(''); setBrowseCategory(''); setLocationNote('');
    locationRequest.current += 1;
    setVisibleCount(12);
    setViewMode('list');
  }, [selectedCity]);

  const cityEvents = events.filter(event => getEventMetroArea(event) === selectedCity && (!registrationOnly || event.registrationOnly));
  // A stream may legitimately continue past midnight. Keep it reachable until
  // the host ends it, even when its scheduled event date is now yesterday.
  const upcoming = cityEvents.filter(e => e.isLive || e.eventDate >= today).sort(compareEventsByDateTime);
  const filterableEvents = cityEvents.filter(e => e.isLive || e.eventDate >= yesterday).sort(compareEventsByDateTime);

  // When opened from a notification, expand + scroll to that event
  useEffect(() => {
    if (focusEventId) {
      const focusedEvent = events.find(event => event.id === focusEventId);
      if (!focusedEvent && eventsLoading) return;
      if (focusedEvent) setSelectedCity(getEventMetroArea(focusedEvent));
      setExpandedId(focusEventId);
      setQuery('');
      setBrowsePeriod(''); setBrowseCategory(''); setLocationNote(''); resetAdvanced();
      locationRequest.current += 1;
      const focusedIndex = events.findIndex(event => event.id === focusEventId);
      if (focusedIndex >= 0) setVisibleCount(count => Math.max(count, focusedIndex + 1));
      const t = setTimeout(() => {
        const el = document.getElementById(`event-${focusEventId}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setFocusEventId?.(null);
      }, 300);
      return () => clearTimeout(t);
    }
  }, [focusEventId, events, eventsLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setVisibleCount(12);
  }, [query, filtered, browsePeriod, browseCategory, registrationOnly]);

  let displayed = (filtered ?? upcoming).filter(event =>
    (!registrationOnly || event.registrationOnly) &&
    (browsePeriod === 'nearby' || matchesEventPeriod(event, browsePeriod))
    && (!browseCategory || eventBrowseType(event) === browseCategory));
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
        const suburb = e.address?.suburb || e.suburb || '';
        const audience = e.audienceType || e.audience || '';
        const hay = [
          e.eventType, e.eventTypeDisplay, e.hostName, e.eventSubject,
          suburb, e.address?.fullAddress, audience, e.speakerName,
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
            const a = audience.toLowerCase();
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
  displayed = [...displayed].sort((a, b) => browsePeriod === 'nearby' && location
    ? (distanceKm(location, a.address) - distanceKm(location, b.address)) || compareEventsByDateTime(a, b)
    : compareEventsByDateTime(a, b));
  const browseControls = <EventBrowseControls events={cityEvents} period={browsePeriod} category={browseCategory}
    onPeriod={choosePeriod} onCategory={chooseCategory} locationNote={locationNote} />;

  const visibleDisplayed = displayed.slice(0, visibleCount);
  const hasMore = visibleDisplayed.length < displayed.length;

  const selectMapEvent = event => {
    setViewMode('list');
    setExpandedId(event.id);
    const index = displayed.findIndex(item => item.id === event.id);
    if (index >= 0) setVisibleCount(count => Math.max(count, index + 1));
    setTimeout(() => {
      document.getElementById(`event-${event.id}`)?.scrollIntoView({ behavior:'smooth', block:'center' });
    }, 120);
  };

  if (eventsLoading && events.length === 0) {
    return (
      <div className="home-event-skeleton" role="status" aria-label="Loading events">
        <div className="skeleton-line wide" />
        {Array.from({ length: 4 }, (_, index) => <div className="skeleton-card" key={index} />)}
      </div>
    );
  }

  return (
    <>
      {!wideLayout && <div className="home-mobile-layout">
      <div data-walkthrough-target="city-and-view" style={{ padding:'8px 16px 0', display:'grid',
        gridTemplateColumns: '1fr', gap:8 }}>
        <CitySelector value={selectedCity} onChange={setSelectedCity} />

      </div>
      {/* ── Search bar — single pill, filter icon inside (right) ── */}
      {viewMode === 'list' && (
      <>
      <div style={{ padding: '8px 16px 6px' }}>
        <div data-walkthrough-target="bottom-search" style={{ display:'flex', alignItems:'center', gap:8,
          background:'var(--cc-surface)', border:'1px solid var(--border,var(--cc-border))',
          borderRadius:14, height:46, padding:'0 8px 0 14px',
          boxShadow:'0 2px 8px color-mix(in srgb, var(--cc-shadow-base) 3%, transparent)' }}>
          <span style={{ color:'var(--muted)', fontSize:'1rem', flexShrink:0 }}>🔍</span>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search events…"
            style={{ flex:1, border:'none', outline:'none', fontSize:'0.875rem',
              background:'transparent', color:'var(--text)', minWidth:0 }} />
          {/* Clear (only when text present) */}
          {query.trim() && (
            <button aria-label="Clear search" onClick={() => setQuery('')}
              style={{ width:40, height:40, borderRadius:'50%', border:'none',
                cursor:'pointer', flexShrink:0, display:'flex', alignItems:'center',
                justifyContent:'center', padding:0, background:'var(--cc-disabled-surface)',
                color:'var(--cc-text)', fontSize:'0.8125rem' }}>×</button>
          )}
          {/* Filter icon — inside the box on the right */}
          <button aria-label="Filters" onClick={() => setShowFilters(s => !s)} style={{
            background:'none', border:'none', cursor:'pointer', boxShadow:'none',
            flexShrink:0, minWidth:40, minHeight:40, padding:'4px 2px', display:'flex', alignItems:'center',
            justifyContent:'center',
            color: showFilters ? 'var(--teal,var(--cc-accent-strong))' : 'var(--muted)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="6" x2="20" y2="6"/><circle cx="9" cy="6" r="2" fill="currentColor"/>
              <line x1="4" y1="12" x2="20" y2="12"/><circle cx="15" cy="12" r="2" fill="currentColor"/>
              <line x1="4" y1="18" x2="20" y2="18"/><circle cx="8" cy="18" r="2" fill="currentColor"/>
            </svg>
          </button>
        </div>
      </div>

      </>)}
      <EventQuickAccess viewMode={viewMode} setViewMode={setViewMode} setPage={setPage} isGuest={isGuest} registrationOnly={registrationOnly} onRegistrationOnly={toggleRegistrationOnly}/>
      {viewMode === 'list' && (<>
      {browseControls}

      {/* ── PINNED header (does NOT scroll away) ── */}
      <div style={{ position:'sticky', top:0, zIndex:10,
        background:'var(--bg,var(--cc-background))', paddingTop:4 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'6px 18px 8px' }}>
          <h2 style={{ margin:0, fontSize:'1.125rem', fontWeight:700, color:'var(--text)' }}>
            Events
          </h2>
        </div>
      </div>

      {/* ── Filters (toggle from filter icon) ── */}
      {showFilters && (
        <EventFilters key={selectedCity + browseRevision} events={filterableEvents} onChange={applyAdvanced} upcomingOnlyOnEmpty />
      )}

      {/* ── Notices ── */}
      <div style={{ padding:'0 16px 10px', fontSize:'0.6875rem', color:'var(--muted)', fontWeight:600, lineHeight:1.6 }}>
        🌙 <em>Hijri dates subject to moon sighting.</em>
        &nbsp;·&nbsp;
        ℹ️ <em>Events are user-submitted — verify with hosts directly.</em>
      </div>

      {/* ── Guest account benefits ── */}
      {offlineMode && events.length > 0 && (
        <div style={{
          margin: '0 16px 12px', padding: '9px 12px', borderRadius: 12,
          background: 'var(--cc-accent-soft)', border: '1px solid var(--cc-accent-border)',
          fontSize: '0.75rem', color: 'var(--cc-accent-strong)', lineHeight: 1.5, fontWeight: 700,
        }}>
          Offline: showing saved events from this device. Text sharing and directions use the cached event details.
        </div>
      )}

      {isGuest && (
        <div style={{
          margin: '0 16px 12px', padding: '10px 14px', borderRadius: 12,
          background: 'var(--cc-accent-soft)', border: '1px solid var(--cc-accent-border)',
          fontSize: '0.75rem', color: 'var(--cc-accent-strong)', lineHeight: 1.6,
        }}>
          🔐 <strong>Sign in for full event details and app benefits.</strong>{' '}
          Use your mobile number to access private-event contact details and directions, add and manage events,
          save favourites, receive reminders and use your profile.
        </div>
      )}

      {displayed.length === 0 && (
        <div className="card center">
          <p>No upcoming events{query ? ' match your search.' : ' yet.'}</p>
          {!isGuest && !query && <button onClick={() => setPage('add')}>Add the First Event</button>}
        </div>
      )}

      {/* ── Events list (scrolls under the pinned block) ── */}
      {visibleDisplayed.map((e, idx) => (
        <div id={`event-${e.id}`} key={e.id}>
        <EventCard event={e} user={user} profile={profile}
          onEdit={ev => { setEditingEvent(ev); setPage('edit'); }}
          onDelete={handleDelete} onCopy={handleCopy}
          isGuest={isGuest}
          isExpanded={expandedId === e.id || (expandedId === '__first__' && idx === 0)}
          onExpand={(id) => setExpandedId(id)}
          savedIds={savedIds}
          onSaveToggle={isGuest ? null : onSaveToggle}
          onStreamStart={onStreamStart} onCalendar={() => setPage('calendar')}
          imagePriority={idx === 0}
        />
        </div>
      ))}

      {hasMore && (
        <button className="load-more-events" onClick={() => setVisibleCount(count => count + 12)}>
          Show more events
        </button>
      )}

      <div style={{ height: 88 }} />

      {/* ── View Calendar & Sync — fixed bar above bottom nav ── */}
      <div data-walkthrough-target="bottom-calendar" onClick={() => setPage('calendar')} style={{
        position:'fixed', bottom:'calc(76px + env(safe-area-inset-bottom))',
        left:16, right:16, zIndex:35, cursor:'pointer',
        background:'var(--cc-surface)',
        borderRadius:16, padding:'14px 18px', display:'flex', alignItems:'center',
        justifyContent:'space-between',
        boxShadow:'0 -2px 12px color-mix(in srgb, var(--cc-shadow-base) 8%, transparent), 0 4px 16px color-mix(in srgb, var(--cc-shadow-base) 10%, transparent)',
        border:'1px solid var(--border,var(--cc-border))' }}>
        <span style={{ display:'flex', alignItems:'center', gap:10,
          fontWeight:700, fontSize:'0.9375rem', color:'var(--text,var(--cc-text))' }}>
          📅 <span>View Calendar &amp; Sync</span>
        </span>
        <span style={{ fontSize:'1.25rem', color:'var(--teal,var(--cc-accent-strong))', fontWeight:700 }}>›</span>
      </div>
      </>
      )}
      {viewMode === 'map' && !isGuest && (
        <Suspense fallback={<div className="event-map-loading">Loading map...</div>}>
          <EventMapView events={displayed} onSelectEvent={selectMapEvent} />
        </Suspense>
      )}
      </div>}

      {wideLayout && <div className="home-desktop-layout">
        <Suspense fallback={<div className="home-event-skeleton"><div className="skeleton-card" /></div>}>
        <DesktopHome
          registrationOnly={registrationOnly} onRegistrationOnly={toggleRegistrationOnly}
          events={cityEvents} mapEvents={displayed} displayed={visibleDisplayed} totalCount={displayed.length}
          hasMore={hasMore} onLoadMore={() => setVisibleCount(count => count + 12)}
          filterableEvents={filterableEvents} browseControls={browseControls} browseRevision={browseRevision}
          filtered={filtered} setFiltered={applyAdvanced} query={query} setQuery={setQuery}
          expandedId={expandedId} setExpandedId={setExpandedId}
          user={user} profile={profile} setPage={setPage} setEditingEvent={setEditingEvent}
          handleDelete={handleDelete} handleCopy={handleCopy} isGuest={isGuest}
          savedIds={savedIds} onSaveToggle={onSaveToggle} onStreamStart={onStreamStart}
          selectedCity={selectedCity} onCityChange={setSelectedCity}
          viewMode={viewMode} setViewMode={setViewMode} onSelectMapEvent={selectMapEvent}
        />
        </Suspense>
      </div>}
    </>
  );
}
