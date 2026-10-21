import React, { useState, useMemo } from 'react';
import EventFilters from '../components/EventFilters';
import { getAdminCity, getSharePrivacy, isSuperAdminRole } from '../utils/permissions';
import { todayLocal } from '../services/dateUtils';
import { STORE_SHARE_LINES } from '../utils/storeLinks';
import { getEventMetroArea } from '../utils/cities';

const ICON_CALENDAR = String.fromCodePoint(0x1F4C5);
const ICON_LOCK = String.fromCodePoint(0x1F512);
const ICON_BUILDING = String.fromCodePoint(0x1F3DB, 0xFE0F);
const ICON_DATE = String.fromCodePoint(0x1F5D3, 0xFE0F);
const ICON_TIME = String.fromCodePoint(0x23F0);
const ICON_PERSON = String.fromCodePoint(0x1F464);
const ICON_PIN = String.fromCodePoint(0x1F4CD);
const ICON_PHONE = String.fromCodePoint(0x1F4DE);
const ICON_MIC = String.fromCodePoint(0x1F399, 0xFE0F);
const ICON_NOTES = String.fromCodePoint(0x1F4DD);
const ICON_SHARE = String.fromCodePoint(0x1F4E4);
const ICON_COPY = String.fromCodePoint(0x1F4CB);
const ICON_CHECK = String.fromCodePoint(0x2713);

function sortEventsForMessage(events) {
  return [...events].sort((a, b) => {
    const dateCompare = String(a.eventDate || '').localeCompare(String(b.eventDate || ''));
    if (dateCompare !== 0) return dateCompare;
    const timeCompare = String(a.startTime || '').localeCompare(String(b.startTime || ''));
    if (timeCompare !== 0) return timeCompare;
    return String(a.hostName || '').localeCompare(String(b.hostName || ''));
  });
}

function formatEventDate(value) {
  try {
    return new Date(value + 'T00:00:00').toLocaleDateString('en-AU', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  } catch {
    return value;
  }
}

function buildMessage(selectedEvents, profile, uid, messageTitle, messageMode = 'detail') {
  if (!selectedEvents.length) return '';

  const lines = [`${ICON_CALENDAR} *Community Events*`, ''];
  if (messageTitle.trim()) lines.push(`*${messageTitle.trim()}*`, '');

  const appendDetailEvent = event => {
    const privacy = getSharePrivacy(profile, event, uid);
    const address = event.address || {};
    const fullAddress = address.fullAddress || [address.street, address.suburb, address.state, address.postcode].filter(Boolean).join(', ');
    const suburbOnly = `${address.suburb || ''}${address.state ? ', ' + address.state : ''}`;
    const location = privacy.showFullAddress ? fullAddress : suburbOnly;
    const locationLabel = privacy.showFullAddress ? 'Location' : 'Suburb';
    const audience = event.audienceType === 'Mixed Audience' ? 'Family Event' : event.audienceType;
    const eventCategory = event.organiserType === 'private' ? 'Private Event' : 'Centre Event';

    lines.push(`*${event.eventType}${event.eventSubject ? ' - ' + event.eventSubject : ''}*`);
    if (audience) lines.push(`*${audience}*`);
    lines.push(`${event.organiserType === 'private' ? ICON_LOCK : ICON_BUILDING} ${eventCategory}`);
    lines.push(`${ICON_DATE} ${formatEventDate(event.eventDate)}${event.hijriDate ? ' - ' + event.hijriDate : ''}`);
    lines.push(`${ICON_TIME} ${event.startTime}${event.endTime ? ' - ' + event.endTime : ''}`);
    if (event.hostName) lines.push(`${ICON_PERSON} ${event.hostName}`);
    if (location) lines.push(`${ICON_PIN} ${locationLabel}: ${location}`);
    if (privacy.showPhone && event.hostPhone) lines.push(`${ICON_PHONE} ${event.hostPhone}`);
    if (event.speakerName) lines.push(`${ICON_MIC} ${event.speakerName}`);
    (event.reciters || [])
      .filter(reciter => reciter?.name?.trim())
      .forEach(reciter => lines.push(`${ICON_MIC} ${reciter.customType || reciter.type || 'Reciter'}: ${reciter.name.trim()}`));
    if (event.notes?.trim()) lines.push(`${ICON_NOTES} Notes: ${event.notes.trim()}`);
    lines.push('');
  };

  const appendBriefEvent = event => {
    const suburb = event.address?.suburb || '';
    const state = event.address?.state || '';
    const suburbLabel = [suburb, state].filter(Boolean).join(', ');
    lines.push(`*${event.hostName || 'Community Event'}*`);
    lines.push(`Date: ${formatEventDate(event.eventDate)}`);
    lines.push(`Time: ${event.startTime}${event.endTime ? ' - ' + event.endTime : ''}`);
    if (suburbLabel) lines.push(`Suburb: ${suburbLabel}`);
    lines.push('');
  };

  const appendEvent = messageMode === 'brief' ? appendBriefEvent : appendDetailEvent;
  const centreEvents = sortEventsForMessage(selectedEvents.filter(event => event.organiserType !== 'private'));
  const privateEvents = sortEventsForMessage(selectedEvents.filter(event => event.organiserType === 'private'));

  if (centreEvents.length) {
    lines.push(`*Centre Programs (${centreEvents.length})*`, '--------------------');
    centreEvents.forEach(appendEvent);
  }
  if (centreEvents.length && privateEvents.length) lines.push('====================', '');
  if (privateEvents.length) {
    lines.push(`*Private Programs (${privateEvents.length})*`, '--------------------');
    privateEvents.forEach(appendEvent);
  }

  lines.push(...STORE_SHARE_LINES);
  lines.push('_Shared via Community Connect Australia_');
  return lines.join('\n');
}

export default function BulkShare({ events, profile, user }) {
  const today = todayLocal();
  const bulkShareCity = getAdminCity(profile);
  const isNationalBulkShare = isSuperAdminRole(profile?.role);
  const upcoming = events.filter(event => (
    event.eventDate >= today &&
    (isNationalBulkShare || getEventMetroArea(event) === bulkShareCity)
  ));
  const [filtered, setFiltered] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [copied, setCopied] = useState(false);
  const [messageTitle, setMessageTitle] = useState('');
  const [messageMode, setMessageMode] = useState('detail');

  const displayed = filtered ?? upcoming;

  const toggleSelect = id => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(displayed.map(event => event.id)));
  const clearAll = () => setSelected(new Set());

  const selectedEvents = displayed.filter(event => selected.has(event.id));
  const message = useMemo(
    () => buildMessage(selectedEvents, profile, user?.uid, messageTitle, messageMode),
    [selectedEvents, profile, user, messageTitle, messageMode]
  );

  const copy = () => {
    navigator.clipboard.writeText(message).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const share = () => {
    if (navigator.share) {
      navigator.share({ title: 'Community Events Programs Update', text: message }).catch(() => {});
      return;
    }
    window.open('https://wa.me/?text=' + encodeURIComponent(message), '_blank');
  };

  return (
    <>
      <div className="card" style={{ marginBottom: 0 }}>
        {!isNationalBulkShare && <p className="small" style={{ margin: 0, color: 'var(--muted)' }}>Your bulk share list is limited to your city.</p>}
        <label htmlFor="bulk-share-title" style={{ display:'block', marginTop:14 }}>
          Message title <span className="small">(optional)</span>
        </label>
        <input
          id="bulk-share-title"
          value={messageTitle}
          onChange={event => setMessageTitle(event.target.value)}
          placeholder="e.g. Events this weekend"
          maxLength={120}
        />
        <div style={{ marginTop: 14 }}>
          <label style={{ display:'block', marginBottom: 6 }}>Message format</label>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 6,
            background: 'var(--cc-accent-soft)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: 4,
          }}>
            <button
              type="button"
              onClick={() => setMessageMode('detail')}
              style={{
                border: 'none',
                borderRadius: 9,
                padding: '10px 8px',
                background: messageMode === 'detail' ? 'var(--teal)' : 'transparent',
                color: messageMode === 'detail' ? 'var(--cc-on-primary)' : 'var(--text)',
                fontWeight: 900,
                cursor: 'pointer',
              }}
            >
              Detailed message
            </button>
            <button
              type="button"
              onClick={() => setMessageMode('brief')}
              style={{
                border: 'none',
                borderRadius: 9,
                padding: '10px 8px',
                background: messageMode === 'brief' ? 'var(--teal)' : 'transparent',
                color: messageMode === 'brief' ? 'var(--cc-on-primary)' : 'var(--text)',
                fontWeight: 900,
                cursor: 'pointer',
              }}
            >
              Brief message
            </button>
          </div>
        </div>
      </div>

      <EventFilters events={upcoming} onChange={setFiltered} />

      <div style={{ padding: '0 16px 8px', display: 'flex', gap: 8, alignItems: 'center' }}>
        <button className="btn-light" style={{ fontSize: '0.75rem', padding: '5px 10px' }} onClick={selectAll}>
          Select all ({displayed.length})
        </button>
        {selected.size > 0 && (
          <button className="btn-light" style={{ fontSize: '0.75rem', padding: '5px 10px' }} onClick={clearAll}>
            Clear selection
          </button>
        )}
        {selected.size > 0 && (
          <span style={{ fontSize: '0.8125rem', color: 'var(--teal)', fontWeight: 600, marginLeft: 'auto' }}>
            {selected.size} selected
          </span>
        )}
      </div>

      {displayed.length === 0 && (
        <div className="card center"><p>No events match filters.</p></div>
      )}
      {displayed.map(event => {
        const isSelected = selected.has(event.id);
        return (
          <div
            key={event.id}
            onClick={() => toggleSelect(event.id)}
            className="card"
            style={{
              margin: '0 16px 8px',
              cursor: 'pointer',
              border: `2px solid ${isSelected ? 'var(--teal)' : 'var(--border)'}`,
              background: isSelected ? 'var(--teal-l,var(--cc-accent-soft))' : 'var(--card,var(--cc-surface))',
            }}
          >
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <div style={{
                width: 22,
                height: 22,
                borderRadius: 6,
                flexShrink: 0,
                marginTop: 2,
                background: isSelected ? 'var(--teal)' : 'transparent',
                border: `2px solid ${isSelected ? 'var(--teal)' : 'var(--border)'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                {isSelected && <span style={{ color: 'var(--cc-on-primary)', fontSize: '0.875rem', lineHeight: 1 }}>{ICON_CHECK}</span>}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 5 }}>
                  <span style={{ background: 'var(--teal-l,var(--cc-accent-soft))', color: 'var(--teal)', fontSize: '0.6875rem', padding: '2px 8px', borderRadius: 99, fontWeight: 700 }}>
                    {event.eventType}
                  </span>
                  <span style={{ background: 'var(--fef3c7,var(--cc-warning-soft))', color: 'var(--cc-warning-strong)', fontSize: '0.6875rem', padding: '2px 8px', borderRadius: 99 }}>
                    {event.organiserType === 'centre' ? `${ICON_BUILDING} Centre` : `${ICON_LOCK} Private`}
                  </span>
                  {event.hijriDate && (
                    <span style={{ background: 'var(--cc-warning-soft)', color: 'var(--cc-warning-strong)', fontSize: '0.6875rem', padding: '2px 8px', borderRadius: 99 }}>
                      {event.hijriDate}
                    </span>
                  )}
                </div>
                <h3 style={{ margin: '0 0 4px', fontSize: '0.9375rem', color: 'var(--text)' }}>
                  {event.eventType} - {event.hostName}
                </h3>
                <p style={{ margin: '0 0 3px', fontSize: '0.8125rem', color: 'var(--muted)' }}>
                  {ICON_DATE} {formatEventDate(event.eventDate)} - {ICON_TIME} {event.startTime}{event.endTime ? ' - ' + event.endTime : ''}
                </p>
                {event.address?.suburb && (
                  <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--muted)' }}>
                    {ICON_PIN} {event.address.suburb}{event.address.state ? ', ' + event.address.state : ''}
                  </p>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {selected.size > 0 && (
        <div className="card" style={{ margin: '16px 16px 0' }}>
          <p style={{ fontWeight: 700, margin: '0 0 8px', fontSize: '0.875rem' }}>
            Message preview ({selected.size} event{selected.size !== 1 ? 's' : ''})
          </p>
          <pre style={{
            background: 'var(--cc-background)',
            borderRadius: 8,
            padding: 12,
            fontSize: '0.75rem',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            color: 'var(--text)',
            maxHeight: 200,
            overflow: 'auto',
            border: '1px solid var(--border)',
            margin: '0 0 12px',
          }}>{message}</pre>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={share} style={{ flex: 2 }}>
              {ICON_SHARE} Share via WhatsApp / SMS
            </button>
            <button onClick={copy} className="btn-light" style={{ flex: 1 }}>
              {copied ? `${ICON_CHECK} Copied!` : `${ICON_COPY} Copy`}
            </button>
          </div>
        </div>
      )}
      <div style={{ height: 32 }} />
    </>
  );
}
