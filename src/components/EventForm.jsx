import React, { useEffect, useState } from 'react';
import ReciterFields from './ReciterFields';
import HijriDatePicker from './HijriDatePicker';
import AddressAutocomplete from './AddressAutocomplete';
import { AUDIENCE_TYPES, EVENT_TYPES, RELIGIOUS_EVENT_TYPES } from '../utils/constants';
import { getHijriDisplay, getHijriParts } from '../services/hijriService';
import { getHijriSettings } from '../services/settingsService';

export default function EventForm({
  initialEvent, onSubmit, submitLabel = null,
  user, profile, existingEvents = [],
  seriesMode = false, saving = false, onCancel = null, initialDate = ''
}) {
  const userName  = profile?.fullName  || user?.displayName || user?.email?.split('@')[0] || '';
  const userPhone = profile?.phone     || '';

  const blank = () => ({
    hostName:            userName,
    hostPhone:           userPhone,
    eventDate:           initialDate || '',
    startTime:           '',
    endTime:             '',
    eventType:           'Majlis',
    customEventType:     '',
    eventSubject:        '',
    audienceType:        'Mixed Audience',
    isOnBehalfOf:        false,
    organiserType:       'private',   // 'private' | 'centre' — default always private
    hostContactOptional: '',
    address:             { fullAddress: '', street: '', suburb: '', state: 'NSW', postcode: '', latitude: null, longitude: null },
    speakerName:         '',
    reciters:            [{ type: 'Reciter', name: '' }],
    hijriDate:           ''
  });

  const [form, setForm]             = useState(initialEvent || blank());
  const [overrides, setOverrides]   = useState([]);
  const [duplicates, setDuplicates] = useState([]);
  const [calendarMode, setCalendarMode] = useState('gregorian'); // 'gregorian' | 'hijri'
  const [hijriInput, setHijriInput]     = useState({});

  const isCustom      = form.eventType === 'Custom';
  const showReligious = RELIGIOUS_EVENT_TYPES.includes(form.eventType);

  useEffect(() => {
    getHijriSettings().then(s => setOverrides(s.overrides || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (form.eventDate) {
      setForm(p => ({ ...p, hijriDate: getHijriDisplay(p.eventDate, overrides) }));
    }
  }, [form.eventDate, overrides]);

  useEffect(() => {
    if (!form.eventDate || !form.startTime) { setDuplicates([]); return; }
    setDuplicates(existingEvents.filter(e =>
      e.eventDate   === form.eventDate &&
      e.startTime   === form.startTime &&
      e.id          !== initialEvent?.id
    ));
  }, [form.eventDate, form.startTime, existingEvents, initialEvent]);

  const update = (field, value) => setForm(p => ({ ...p, [field]: value }));

  const toggleOnBehalf = checked => setForm(p => ({
    ...p, isOnBehalfOf: checked,
    hostName:  checked ? '' : userName,
    hostPhone: checked ? '' : userPhone
  }));

  // When event type changes, clear custom type if switching away
  const handleEventTypeChange = val => {
    setForm(p => ({ ...p, eventType: val, customEventType: val === 'Custom' ? p.customEventType : '' }));
  };

  const submit = e => {
    e.preventDefault();
    // Resolve the display event type
    const resolvedType = isCustom && form.customEventType.trim()
      ? form.customEventType.trim()
      : form.eventType;

    onSubmit({
      ...form,
      eventTypeDisplay: resolvedType,    // human-readable label (e.g. "Aqeeqa")
      speakerName: showReligious ? form.speakerName : '',
      reciters:    showReligious ? (form.reciters || []).filter(r => r.name?.trim()) : [],
    });
  };

  return (
    <form className="card" onSubmit={submit}>
      <h2>{initialEvent ? 'Edit Event' : 'Add Event'}</h2>

      {/* On behalf of */}
      <label className="checkbox" style={{ marginBottom: 10 }}>
        <input type="checkbox" checked={!!form.isOnBehalfOf}
          onChange={e => toggleOnBehalf(e.target.checked)} />
        <span>I am adding this event on behalf of someone else</span>
      </label>

      {/* Organiser Type toggle — always shown, default private */}
      <div style={{ marginBottom: 14 }}>
        <label style={{ display: 'block', marginBottom: 6 }}>
          Organiser Type
          <span className="small" style={{ marginLeft: 6, fontWeight: 400 }}>
            (Private = individual host · Centre = organisation or centre)
          </span>
        </label>
        <div style={{
          display: 'inline-flex', borderRadius: 12,
          border: '1px solid var(--border)', overflow: 'hidden',
          background: 'var(--bg,#f3f4f6)'
        }}>
          {['private', 'centre'].map(opt => (
            <button
              key={opt}
              type="button"
              onClick={() => update('organiserType', opt)}
              style={{
                padding: '9px 22px',
                border: 'none', cursor: 'pointer',
                fontWeight: form.organiserType === opt ? 900 : 500,
                fontSize: 14,
                background: form.organiserType === opt ? 'var(--teal)' : 'transparent',
                color:      form.organiserType === opt ? 'white'       : 'var(--muted)',
                transition: 'all .15s',
                textTransform: 'capitalize'
              }}
            >
              {opt === 'private' ? '🔒 Private' : '🏛 Centre'}
            </button>
          ))}
        </div>
      </div>

      {/* Host name */}
      <label>Host Name *</label>
      <input required
        placeholder={form.isOnBehalfOf ? "Enter the host's name" : 'Your name'}
        value={form.hostName} onChange={e => update('hostName', e.target.value)} />

      {/* Host phone — shown for all events */}
      <label>Host Phone Number <span className="small">(optional)</span></label>
      <input
        type="tel"
        placeholder="e.g. 0412 345 678"
        value={form.hostPhone || ''}
        onChange={e => update('hostPhone', e.target.value)}
      />

      {form.isOnBehalfOf && (
        <>
          <label>Host Contact Email <span className="small">(optional)</span></label>
          <input value={form.hostContactOptional || ''}
            onChange={e => update('hostContactOptional', e.target.value)}
            placeholder="Email of host (if different from phone above)" />
        </>
      )}

      {/* Date + time — hidden in series mode, date is controlled by AddSeriesEvents */}
      {!seriesMode && (
      <div style={{ marginBottom: 8 }}>
        <label style={{ display: 'block', marginBottom: 6 }}>Date *</label>
        <div style={{ display: 'inline-flex', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden', background: 'var(--bg,#f3f4f6)', marginBottom: 8 }}>
          {['gregorian', 'hijri'].map(mode => (
            <button key={mode} type="button"
              onClick={() => setCalendarMode(mode)}
              style={{
                padding: '7px 16px', border: 'none', cursor: 'pointer',
                fontWeight: calendarMode === mode ? 900 : 500, fontSize: 13,
                background: calendarMode === mode ? 'var(--teal)' : 'transparent',
                color:      calendarMode === mode ? 'white' : 'var(--muted)',
                transition: 'all .15s'
              }}>
              {mode === 'gregorian' ? '📅 Gregorian' : '🌙 Hijri'}
            </button>
          ))}
        </div>

        {calendarMode === 'gregorian' ? (
          <>
            <input type="date" value={form.eventDate}
              onChange={e => {
                update('eventDate', e.target.value);
                setForm(p => ({ ...p, enteredAsHijri: false }));
              }} />
            {form.eventDate && (
              <p className="small" style={{ marginTop: -8 }}>Hijri: {form.hijriDate}</p>
            )}
          </>
        ) : (
          <>
            <HijriDatePicker
              value={hijriInput}
              overrides={overrides}
              onChange={h => {
                setHijriInput(h);
                setForm(p => ({
                  ...p,
                  eventDate:    h.gregorianDate || '',
                  hijriDate:    h.displayStr || '',
                  hijriDay:     h.hDay,
                  hijriMonth:   h.hMonth,
                  hijriYear:    h.hYear,
                  enteredAsHijri: true
                }));
              }}
            />
          </>
        )}
      </div>
      )}

      <div className="row" style={{ marginTop: 4 }}>
        <div>
          <label>Start Time *</label>
          <input type="time" required value={form.startTime}
            onChange={e => update('startTime', e.target.value)} />
        </div>
        <div>
          <label>End Time <span className="small">(optional)</span></label>
          <input type="time" value={form.endTime || ''}
            onChange={e => update('endTime', e.target.value)} />
        </div>
      </div>

      {/* Duplicate warning */}
      {duplicates.length > 0 && (
        <div style={{ background: '#fffbeb', border: '1px solid #f59e0b', borderRadius: 12, padding: '12px 14px', marginBottom: 12 }}>
          <div style={{ fontWeight: 800, color: '#92400e', marginBottom: 6 }}>
            ⚠️ {duplicates.length} event{duplicates.length > 1 ? 's' : ''} already exist{duplicates.length === 1 ? 's' : ''} at this date and time:
          </div>
          {duplicates.map(e => (
            <div key={e.id} style={{ fontSize: 13, color: '#78350f', marginBottom: 3 }}>
              · <strong>{e.eventTypeDisplay || e.eventType}</strong> by <strong>{e.hostName}</strong>
              {e.address?.suburb ? ` · ${e.address.suburb}` : ''} · {e.audienceType}
            </div>
          ))}
          <div style={{ fontSize: 12, color: '#92400e', marginTop: 6 }}>You can still save — this is a notice only.</div>
        </div>
      )}



      {/* Address */}
      <label>Address *</label>
      <AddressAutocomplete
        value={form.address}
        onChange={addr => setForm(p => ({ ...p, address: addr }))}
        required
      />

      {/* Event type */}
      <label>Event Type *</label>
      <select value={form.eventType} onChange={e => handleEventTypeChange(e.target.value)}>
        {EVENT_TYPES.map(t => <option key={t}>{t}</option>)}
      </select>

      {/* Custom event type text box */}
      {isCustom && (
        <>
          <label>Custom Event Type *</label>
          <input
            required
            placeholder="e.g. Aqeeqa, Nikah, Dua, Commemoration…"
            value={form.customEventType || ''}
            onChange={e => update('customEventType', e.target.value)}
          />
        </>
      )}

      {/* Subject — optional, shown for all event types */}
      <label>
        Subject <span className="small">(optional)</span>
      </label>
      <input
        placeholder="e.g. Shahadat of Imam Hussain (A.S.), Birthday of…"
        value={form.eventSubject || ''}
        onChange={e => update('eventSubject', e.target.value)}
      />

      {/* Audience */}
      <label>Audience Type *</label>
      <select value={form.audienceType} onChange={e => update('audienceType', e.target.value)}>
        {AUDIENCE_TYPES.map(t => <option key={t}>{t}</option>)}
      </select>

      {/* Speaker + Reciters — Majlis, Milad, Custom */}
      {showReligious && (
        <div className="notice">
          <p className="small" style={{ margin: '0 0 10px' }}>
            Speaker and reciters available for <strong>{isCustom ? (form.customEventType || 'Custom') : form.eventType}</strong> events.
          </p>
          <label>Speaker</label>
          <input value={form.speakerName || ''} onChange={e => update('speakerName', e.target.value)} placeholder="Speaker name" />
          <ReciterFields reciters={form.reciters || []} setReciters={r => update('reciters', r)} />
        </div>
      )}

      {onCancel && (
        <button type="button" className="btn-muted" onClick={onCancel} style={{ marginRight: 8 }}>
          Cancel
        </button>
      )}
      <button type="submit" disabled={saving}>
        {saving ? 'Saving…' : submitLabel || (initialEvent?.id ? 'Update Event' : 'Add Event')}
      </button>
    </form>
  );
}
