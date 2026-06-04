import React, { useState, useMemo } from 'react';
import EventFilters from '../components/EventFilters';
import { getSharePrivacy } from '../utils/permissions';

function buildMessage(selectedEvents, profile, uid) {
  if (!selectedEvents.length) return '';
  const APP_URL = 'https://communityevents.siza.info';
  const fmt = d => { try { return new Date(d+'T00:00:00').toLocaleDateString('en-AU',{weekday:'short',day:'numeric',month:'short'}); } catch { return d; } };
  const lines = ['📅 *Community Events*', ''];
  selectedEvents.forEach(e => {
    const privacy = getSharePrivacy(profile, e, uid);
    const a = e.address || {};
    const fullAddr = a.fullAddress || [a.street, a.suburb, a.state, a.postcode].filter(Boolean).join(', ');
    const suburbOnly = `${a.suburb || ''}${a.state ? ', ' + a.state : ''}`;
    const loc = privacy.showFullAddress ? fullAddr : suburbOnly;
    const locLabel = privacy.showFullAddress ? 'Location' : 'Suburb';

    lines.push(`*${e.eventType}${e.eventSubject ? ' — ' + e.eventSubject : ''}*`);
    lines.push(`🗓 ${fmt(e.eventDate)}${e.hijriDate ? ' · ' + e.hijriDate : ''}`);
    lines.push(`⏰ ${e.startTime}${e.endTime ? ' – ' + e.endTime : ''}`);
    if (e.hostName) lines.push(`👤 ${e.hostName}`);
    if (loc) lines.push(`📍 ${locLabel}: ${loc}`);
    if (privacy.showPhone && e.hostPhone) lines.push(`📞 ${e.hostPhone}`);
    if (e.speakerName) lines.push(`🎤 ${e.speakerName}`);
    lines.push('');
  });
  lines.push(`🔗 ${APP_URL}`);
  lines.push('_Shared via Community Events_');
  return lines.join('\n');
}

export default function BulkShare({ events, profile, user }) {
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = events.filter(e => e.eventDate >= today);
  const [filtered,  setFiltered]  = useState(null);
  const [selected,  setSelected]  = useState(new Set());
  const [copied,    setCopied]    = useState(false);

  const displayed = filtered ?? upcoming;

  const toggleSelect = id => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll  = () => setSelected(new Set(displayed.map(e => e.id)));
  const clearAll   = () => setSelected(new Set());

  const selectedEvents = displayed.filter(e => selected.has(e.id));
  const message = useMemo(() => buildMessage(selectedEvents, profile, user?.uid), [selectedEvents, profile, user]);

  const copy = () => {
    navigator.clipboard.writeText(message).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const share = () => {
    if (navigator.share) { navigator.share({ text: message }).catch(() => {}); return; }
    const url = 'https://wa.me/?text=' + encodeURIComponent(message);
    window.open(url, '_blank');
  };

  return (
    <>
      <div className="card" style={{ marginBottom: 0 }}>
        <h2 style={{ margin: '0 0 4px' }}>📤 Bulk Share Events</h2>
        <p className="small" style={{ margin: 0, color: 'var(--muted)' }}>
          Filter events, select the ones you want, then share or copy.
        </p>
      </div>

      {/* Filters */}
      <EventFilters events={upcoming} onChange={setFiltered} />

      {/* Select all / clear */}
      <div style={{ padding: '0 16px 8px', display: 'flex', gap: 8, alignItems: 'center' }}>
        <button className="btn-light" style={{ fontSize: 12, padding: '5px 10px' }} onClick={selectAll}>
          Select all ({displayed.length})
        </button>
        {selected.size > 0 && (
          <button className="btn-light" style={{ fontSize: 12, padding: '5px 10px' }} onClick={clearAll}>
            Clear selection
          </button>
        )}
        {selected.size > 0 && (
          <span style={{ fontSize: 13, color: 'var(--teal)', fontWeight: 600, marginLeft: 'auto' }}>
            {selected.size} selected
          </span>
        )}
      </div>

      {/* Event list with checkboxes */}
      {displayed.length === 0 && (
        <div className="card center"><p>No events match filters.</p></div>
      )}
      {displayed.map(e => {
        const isSel = selected.has(e.id);
        const fmt = d => { try { return new Date(d+'T00:00:00').toLocaleDateString('en-AU',{weekday:'short',day:'numeric',month:'short'}); } catch { return d; } };
        return (
          <div key={e.id} onClick={() => toggleSelect(e.id)}
            className="card"
            style={{
              margin: '0 16px 8px', cursor: 'pointer',
              border: `2px solid ${isSel ? 'var(--teal)' : 'var(--border)'}`,
              background: isSel ? 'var(--teal-l,#e6f4f1)' : 'var(--card,white)',
            }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              {/* Checkbox */}
              <div style={{
                width: 22, height: 22, borderRadius: 6, flexShrink: 0, marginTop: 2,
                background: isSel ? 'var(--teal)' : 'transparent',
                border: `2px solid ${isSel ? 'var(--teal)' : 'var(--border)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {isSel && <span style={{ color: 'white', fontSize: 14, lineHeight: 1 }}>✓</span>}
              </div>
              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 5 }}>
                  <span style={{ background: 'var(--teal-l,#e6f4f1)', color: 'var(--teal)', fontSize: 11, padding: '2px 8px', borderRadius: 99, fontWeight: 700 }}>
                    {e.eventType}
                  </span>
                  <span style={{ background: 'var(--fef3c7,#fef3c7)', color: '#92400e', fontSize: 11, padding: '2px 8px', borderRadius: 99 }}>
                    {e.organiserType === 'centre' ? '🏛 Centre' : '🔒 Private'}
                  </span>
                  {e.hijriDate && (
                    <span style={{ background: '#fef3c7', color: '#92400e', fontSize: 11, padding: '2px 8px', borderRadius: 99 }}>
                      {e.hijriDate}
                    </span>
                  )}
                </div>
                <h3 style={{ margin: '0 0 4px', fontSize: 15, color: 'var(--text)' }}>
                  {e.eventType} — {e.hostName}
                </h3>
                <p style={{ margin: '0 0 3px', fontSize: 13, color: 'var(--muted)' }}>
                  📅 {fmt(e.eventDate)} · ⏰ {e.startTime}{e.endTime ? ' – '+e.endTime : ''}
                </p>
                {e.address?.suburb && (
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>
                    📍 {e.address.suburb}{e.address.state ? ', '+e.address.state : ''}
                  </p>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {/* Message preview + actions */}
      {selected.size > 0 && (
        <div className="card" style={{ margin: '16px 16px 0' }}>
          <p style={{ fontWeight: 700, margin: '0 0 8px', fontSize: 14 }}>
            Message preview ({selected.size} event{selected.size !== 1 ? 's' : ''})
          </p>
          <pre style={{
            background: '#f9fafb', borderRadius: 8, padding: 12,
            fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            color: 'var(--text)', maxHeight: 200, overflow: 'auto',
            border: '1px solid var(--border)', margin: '0 0 12px',
          }}>{message}</pre>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={share} style={{ flex: 2 }}>
              📤 Share via WhatsApp / SMS
            </button>
            <button onClick={copy} className="btn-light" style={{ flex: 1 }}>
              {copied ? '✓ Copied!' : '📋 Copy'}
            </button>
          </div>
        </div>
      )}
      <div style={{ height: 32 }} />
    </>
  );
}
