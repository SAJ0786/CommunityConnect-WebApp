import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, MapPinned, Navigation } from 'lucide-react';
import { compareEventsByDateTime, localDateStr, todayLocal } from '../services/dateUtils';
import { hasGoogleMapsKey, loadGoogleMapsScript, waitForGoogleMaps } from '../services/googleMapsLoader';

const TIME_FILTERS = [
  { key: 'today', label: 'Today' },
  { key: 'tomorrow', label: 'Tomorrow' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'all', label: 'All Upcoming' },
];

const AUDIENCE_COLORS = {
  ladies: '#ec4899',
  gents: '#2563eb',
  family: '#0f766e',
  kids: '#f97316',
  other: '#64748b',
};

function audienceKey(value = '') {
  const text = String(value).toLowerCase();
  if (text.includes('ladies')) return 'ladies';
  if (text.includes('gents')) return 'gents';
  if (text.includes('kids')) return 'kids';
  if (text.includes('family') || text.includes('mixed')) return 'family';
  return 'other';
}

function audienceLabel(value = '') {
  const key = audienceKey(value);
  if (key === 'ladies') return 'Ladies';
  if (key === 'gents') return 'Gents';
  if (key === 'kids') return 'Kids';
  if (key === 'family') return 'Family';
  return 'Other';
}

function markerIcon(color) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="46" viewBox="0 0 34 46">
    <path fill="${color}" d="M17 1.5C8.4 1.5 1.5 8.4 1.5 17c0 11.8 15.5 27.5 15.5 27.5S32.5 28.8 32.5 17C32.5 8.4 25.6 1.5 17 1.5z"/>
    <circle cx="17" cy="17" r="6.2" fill="white"/>
  </svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new window.google.maps.Size(28, 38),
    anchor: new window.google.maps.Point(14, 38),
  };
}

function parseTimeMinutes(value = '') {
  const match = String(value).match(/^(\d{1,2}):(\d{2})/);
  if (!match) return 24 * 60;
  return Number(match[1]) * 60 + Number(match[2]);
}

function eventDateLabel(event) {
  if (!event.eventDate) return '';
  const date = new Date(`${event.eventDate}T12:00:00`);
  return date.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
}

function directionsUrl(event) {
  const lat = event.address?.latitude;
  const lng = event.address?.longitude;
  const fullAddress = event.address?.fullAddress || '';
  const destination = lat && lng ? `${lat},${lng}` : encodeURIComponent(fullAddress);
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return isIOS
    ? `https://maps.apple.com/?daddr=${destination}&dirflg=d`
    : `https://www.google.com/maps/dir/?api=1&destination=${destination}`;
}

function filterEventsByTime(events, filter) {
  const today = todayLocal();
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const tomorrow = localDateStr(1);
  const weekEnd = localDateStr(6);
  const monthEndDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const monthEnd = [
    monthEndDate.getFullYear(),
    String(monthEndDate.getMonth() + 1).padStart(2, '0'),
    String(monthEndDate.getDate()).padStart(2, '0'),
  ].join('-');

  return events.filter(event => {
    if (event.isLive) return true;
    if (!event.eventDate || event.eventDate < today) return false;
    if (filter === 'today') {
      return event.eventDate === today && parseTimeMinutes(event.startTime) >= nowMinutes;
    }
    if (filter === 'tomorrow') return event.eventDate === tomorrow;
    if (filter === 'week') return event.eventDate >= today && event.eventDate <= weekEnd;
    if (filter === 'month') return event.eventDate >= today && event.eventDate <= monthEnd;
    return event.eventDate >= today;
  });
}

function hasCoordinates(event) {
  return Number.isFinite(Number(event.address?.latitude)) && Number.isFinite(Number(event.address?.longitude));
}

function createMarkerPopup(event, color, onSelectEvent) {
  const wrapper = document.createElement('div');
  wrapper.className = 'event-map-infowindow';

  const title = document.createElement('strong');
  title.textContent = `${event.eventTypeDisplay || event.eventType || 'Event'} - ${event.hostName || 'Host'}`;
  wrapper.appendChild(title);

  const meta = document.createElement('span');
  meta.textContent = `${eventDateLabel(event)} · ${event.startTime || 'Time TBA'} · ${event.address?.suburb || ''}`;
  wrapper.appendChild(meta);

  const audience = document.createElement('small');
  audience.textContent = audienceLabel(event.audienceType || event.audience);
  audience.style.color = color;
  wrapper.appendChild(audience);

  const actions = document.createElement('div');
  actions.className = 'event-map-infowindow-actions';

  const viewButton = document.createElement('button');
  viewButton.type = 'button';
  viewButton.textContent = 'View';
  viewButton.addEventListener('click', eventClick => {
    eventClick.preventDefault();
    onSelectEvent?.(event);
  });

  const directionsLink = document.createElement('a');
  directionsLink.href = directionsUrl(event);
  directionsLink.target = '_blank';
  directionsLink.rel = 'noreferrer';
  directionsLink.textContent = 'Directions';

  actions.appendChild(viewButton);
  actions.appendChild(directionsLink);
  wrapper.appendChild(actions);
  return wrapper;
}

export default function EventMapView({ events, onSelectEvent }) {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markersRef = useRef([]);
  const infoWindowRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [timeFilter, setTimeFilter] = useState('today');
  const [selectedEvent] = useState(null);

  useEffect(() => {
    if (!hasGoogleMapsKey()) return;
    loadGoogleMapsScript();
    waitForGoogleMaps(() => setReady(true));
  }, []);

  const mapEvents = useMemo(() => (
    filterEventsByTime(events, timeFilter)
      .filter(hasCoordinates)
      .sort(compareEventsByDateTime)
  ), [events, timeFilter]);

  useEffect(() => {
    if (!ready || !mapRef.current || !window.google?.maps) return;
    if (!mapInstance.current) {
      mapInstance.current = new window.google.maps.Map(mapRef.current, {
        center: { lat: -33.8688, lng: 151.2093 },
        zoom: 10,
        mapTypeControl: false,
        fullscreenControl: false,
        streetViewControl: false,
        clickableIcons: false,
      });
      infoWindowRef.current = new window.google.maps.InfoWindow({ maxWidth: 280 });
    }

    infoWindowRef.current?.close();
    markersRef.current.forEach(marker => marker.setMap(null));
    markersRef.current = [];

    if (!mapEvents.length) return;
    const bounds = new window.google.maps.LatLngBounds();
    mapEvents.forEach(event => {
      const position = {
        lat: Number(event.address.latitude),
        lng: Number(event.address.longitude),
      };
      const key = audienceKey(event.audienceType || event.audience);
      const color = AUDIENCE_COLORS[key] || AUDIENCE_COLORS.other;
      const marker = new window.google.maps.Marker({
        position,
        map: mapInstance.current,
        title: `${event.eventTypeDisplay || event.eventType || 'Event'} - ${event.hostName || ''}`,
        icon: markerIcon(color),
      });
      marker.addListener('click', () => {
        infoWindowRef.current?.setContent(createMarkerPopup(event, color, onSelectEvent));
        infoWindowRef.current?.open({ map: mapInstance.current, anchor: marker });
        mapInstance.current.panTo(position);
      });
      markersRef.current.push(marker);
      bounds.extend(position);
    });

    if (mapEvents.length === 1) {
      mapInstance.current.setCenter(bounds.getCenter());
      mapInstance.current.setZoom(14);
    } else {
      mapInstance.current.fitBounds(bounds, 52);
    }
  }, [ready, mapEvents, onSelectEvent]);

  if (!hasGoogleMapsKey()) {
    return (
      <div className="event-map-empty">
        <MapPinned size={34} />
        <h3>Map is not configured</h3>
        <p>Google Maps API key is missing.</p>
      </div>
    );
  }

  return (
    <section className="event-map-view">
      <div className="event-map-filter-row" aria-label="Map time filter">
        {TIME_FILTERS.map(filter => (
          <button key={filter.key} onClick={() => setTimeFilter(filter.key)}
            className={timeFilter === filter.key ? 'active' : ''}>
            {filter.label}
          </button>
        ))}
      </div>

      <div className="event-map-legend" aria-label="Audience marker colours">
        <span><i style={{ background:AUDIENCE_COLORS.family }} /> Family</span>
        <span><i style={{ background:AUDIENCE_COLORS.gents }} /> Gents</span>
        <span><i style={{ background:AUDIENCE_COLORS.ladies }} /> Ladies</span>
        <span><i style={{ background:AUDIENCE_COLORS.kids }} /> Kids</span>
        <span><i style={{ background:AUDIENCE_COLORS.other }} /> Other</span>
      </div>

      <div className="event-map-shell">
        {!ready && <div className="event-map-loading">Loading map...</div>}
        <div ref={mapRef} className="event-map-canvas" />
      </div>

      <div className="event-map-count">
        <CalendarDays size={15} />
        {mapEvents.length} mapped event{mapEvents.length === 1 ? '' : 's'}
      </div>

      {mapEvents.length === 0 && ready && (
        <div className="event-map-empty">
          <MapPinned size={34} />
          <h3>No mapped events</h3>
          <p>No events with saved map coordinates match this time filter.</p>
        </div>
      )}

      {selectedEvent && (
        <div className="event-map-preview">
          <div>
            <strong>{selectedEvent.eventTypeDisplay || selectedEvent.eventType || 'Event'} - {selectedEvent.hostName || 'Host'}</strong>
            <span>{eventDateLabel(selectedEvent)} · {selectedEvent.startTime || 'Time TBA'} · {selectedEvent.address?.suburb || ''}</span>
            <small style={{ color: AUDIENCE_COLORS[audienceKey(selectedEvent.audienceType || selectedEvent.audience)] }}>
              {audienceLabel(selectedEvent.audienceType || selectedEvent.audience)}
            </small>
          </div>
          <div>
            <button type="button" onClick={() => onSelectEvent?.(selectedEvent)}>View</button>
            <a href={directionsUrl(selectedEvent)} target="_blank" rel="noreferrer">
              <Navigation size={14} /> Directions
            </a>
          </div>
        </div>
      )}
    </section>
  );
}
