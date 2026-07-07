import React, { useEffect, useState } from 'react';
import ReciterFields from './ReciterFields';
import HijriDatePicker from './HijriDatePicker';
import AddressAutocomplete from './AddressAutocomplete';
import { AUDIENCE_TYPES, EVENT_TYPES, RELIGIOUS_EVENT_TYPES } from '../utils/constants';
import { getHijriDisplay, getHijriParts, hijriDisplayFromParts } from '../services/hijriService';
import { getHijriSettings } from '../services/settingsService';
import { getOrganisations } from '../services/organisationsService';
import { uploadEventImage, getFallbackImage } from '../services/imageService';

const BUILT_IN_CENTRE_NAMES = {
  muhammadi: 'Muhammadi Welfare Association',
  imamhasan: 'Imam Hasan Centre',
  alamdar: 'Alamdar Granville',
};

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
    notes:               '',
    audienceType:        'Family Event',
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
  const [dynamicOrgs, setDynamicOrgs] = useState([]);
  const [duplicates, setDuplicates] = useState([]);
  const [validationErrors, setValidationErrors] = useState({});
  const [calendarMode, setCalendarMode] = useState('gregorian'); // 'gregorian' | 'hijri'
  const [hijriInput, setHijriInput]     = useState({});
  // Photo upload
  const [imagePreview, setImagePreview] = useState(initialEvent?.imageUrl || '');
  const [uploadingImg,  setUploadingImg] = useState(false);
  const [pendingFile,   setPendingFile]  = useState(null);

  const isCustom      = form.eventType === 'Custom';
  const showReligious = RELIGIOUS_EVENT_TYPES.includes(form.eventType);

  useEffect(() => {
    getHijriSettings().then(s => setOverrides(s.overrides || [])).catch(() => {});
    getOrganisations().then(orgs => {
      // Filter out built-ins — they are already hardcoded as static options above
      const custom = (orgs || []).filter(o => !o.builtIn);
      setDynamicOrgs(custom);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (form.eventDate) {
      setForm(p => ({
        ...p,
        hijriDate: p.enteredAsHijri && p.hijriDay && p.hijriMonth && p.hijriYear
          ? hijriDisplayFromParts(p.hijriDay, p.hijriMonth, p.hijriYear)
          : getHijriDisplay(p.eventDate, overrides),
      }));
    }
  }, [form.eventDate, form.enteredAsHijri, form.hijriDay, form.hijriMonth, form.hijriYear, overrides]);

  useEffect(() => {
    if (!form.eventDate || !form.startTime) { setDuplicates([]); return; }
    setDuplicates(existingEvents.filter(e =>
      e.eventDate   === form.eventDate &&
      e.startTime   === form.startTime &&
      e.id          !== initialEvent?.id
    ));
  }, [form.eventDate, form.startTime, existingEvents, initialEvent]);

  const clearValidationError = field => setValidationErrors(current => {
    if (!current[field]) return current;
    const next = { ...current };
    delete next[field];
    return next;
  });
  const update = (field, value) => {
    setForm(p => ({ ...p, [field]: value }));
    clearValidationError(field);
  };

  const getCentreName = organiserType => {
    if (!organiserType || organiserType === 'private' || organiserType === 'centre') return '';
    return BUILT_IN_CENTRE_NAMES[organiserType]
      || dynamicOrgs.find(org => org.slug === organiserType)?.name
      || '';
  };

  const handleOrganiserChange = organiserType => setForm(p => ({
    ...p,
    organiserType,
    hostName: getCentreName(organiserType)
      || (p.isOnBehalfOf ? '' : userName),
  }));

  const toggleOnBehalf = checked => setForm(p => ({
    ...p, isOnBehalfOf: checked,
    hostName:  getCentreName(p.organiserType) || (checked ? '' : userName),
    hostPhone: checked ? '' : userPhone
  }));

  // When event type changes, clear custom type if switching away
  const handleEventTypeChange = val => {
    setForm(p => ({ ...p, eventType: val, customEventType: val === 'Custom' ? p.customEventType : '' }));
  };

  // Handle photo selection — preview immediately, upload on submit
  const handlePhotoPick = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return;
    setPendingFile(file);
    const reader = new FileReader();
    reader.onload = ev => setImagePreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  const removePhoto = () => {
    setPendingFile(null);
    setImagePreview('');
    setForm(p => ({ ...p, imageUrl: '', imagePath: '' }));
  };

  const submit = async e => {
    e.preventDefault();
    const addressText = typeof form.address === 'string'
      ? form.address.trim()
      : String(form.address?.fullAddress || '').trim();
    const errors = {};
    if (!seriesMode && !form.eventDate) errors.eventDate = 'Please select the event date.';
    if (!form.startTime) errors.startTime = 'Please select the event start time.';
    if (addressText.length < 5) errors.address = 'Please enter the full event address.';
    if (Object.keys(errors).length) {
      setValidationErrors(errors);
      window.setTimeout(() => {
        document.querySelector('.event-form [aria-invalid="true"]')?.focus();
      }, 0);
      return;
    }
    setValidationErrors({});
    // Resolve the display event type
    const resolvedType = isCustom && form.customEventType.trim()
      ? form.customEventType.trim()
      : form.eventType;

    // Upload the photo first if a new one was picked
    let imageUrl = form.imageUrl || '';
    let imagePath = form.imagePath || '';
    if (pendingFile) {
      setUploadingImg(true);
      try {
        const eventId = initialEvent?.id || `${user?.uid || 'anon'}_${Date.now()}`;
        const res = await uploadEventImage(pendingFile, eventId, user?.uid);
        imageUrl = res.url;
        imagePath = res.path;
      } catch (err) {
        console.error('Image upload failed:', err);
        // Continue without image — fallback logo will be used
      }
      setUploadingImg(false);
    }

    onSubmit({
      ...form,
      hostName: getCentreName(form.organiserType) || form.hostName,
      imageUrl,
      imagePath,
      eventTypeDisplay: resolvedType,    // human-readable label (e.g. "Aqeeqa")
      speakerName: showReligious ? form.speakerName : '',
      reciters:    showReligious ? (form.reciters || []).filter(r => r.name?.trim()) : [],
    });
  };

  return (
    <form className="card event-form" onSubmit={submit} noValidate>
      <h2>{initialEvent?.__editSeries ? 'Edit Entire Series' : initialEvent ? 'Edit Event' : 'Add Event'}</h2>
      {Object.keys(validationErrors).length > 0 && (
        <div className="event-validation-summary" role="alert">
          <strong>Complete the highlighted mandatory fields:</strong>
          <ul>{Object.values(validationErrors).map(message => <li key={message}>{message}</li>)}</ul>
        </div>
      )}
      {initialEvent?.__editSeries && (
        <p className="small" style={{ marginTop:-8, color:'var(--muted)' }}>
          Shared details will be updated across the series. Each event keeps its own Gregorian and Hijri date.
        </p>
      )}

      {/* ── Event Poster ── */}
      <label>Upload Event Poster <span className="small" style={{ fontWeight: 400 }}>(optional)</span></label>
      {imagePreview ? (
        <div style={{ position: 'relative', borderRadius: 14, overflow: 'hidden',
          marginBottom: 14, marginTop: 4 }}>
          <img src={imagePreview} alt="Event"
            style={{ width: '100%', height: 180, objectFit: 'cover', display: 'block' }} />
          <button type="button" onClick={removePhoto} style={{
            position: 'absolute', top: 8, right: 8, width: 32, height: 32,
            borderRadius: '50%', background: 'rgba(0,0,0,0.6)', color: 'white',
            border: 'none', cursor: 'pointer', fontSize: '1rem', lineHeight: 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>×</button>
        </div>
      ) : (
        <label style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7,
          background: 'var(--bg,#f4f7f6)', border: '2px dashed #b9ccc8',
          borderRadius: 14, padding: 22, cursor: 'pointer',
          color: 'var(--teal,#0f766e)', marginTop: 4, marginBottom: 14,
        }}>
          <span style={{ fontSize: '1.875rem' }}>📷</span>
          <span style={{ fontSize: '0.8125rem', fontWeight: 800 }}>Upload your event poster</span>
          <span style={{ fontSize: '0.6875rem', color: 'var(--muted)', textAlign: 'center' }}>
            Optional — if you don't, your organisation logo will be shown
          </span>
          <input type="file" accept="image/*" onChange={handlePhotoPick}
            style={{ display: 'none' }} />
        </label>
      )}

      {/* On behalf of */}
      <label className="checkbox" style={{ marginBottom: 10 }}>
        <input type="checkbox" checked={!!form.isOnBehalfOf}
          onChange={e => toggleOnBehalf(e.target.checked)} />
        <span>I am adding this event on behalf of someone else</span>
      </label>

      {/* Organiser Type — private or specific organisation */}
      <div style={{ marginBottom: 14 }}>
        <label style={{ display: 'block', marginBottom: 6 }}>
          Organiser Type
          <span className="small" style={{ marginLeft: 6, fontWeight: 400 }}>
            (Used to show the correct logo when no poster is uploaded)
          </span>
        </label>
        <select value={form.organiserType}
          onChange={e => handleOrganiserChange(e.target.value)}>
          <option value="private">🔒 Private (individual host)</option>
          <option value="muhammadi">🏛 Muhammadi Welfare Association</option>
          <option value="imamhasan">🏛 Imam Hasan Centre</option>
          <option value="alamdar">🏛 Alamdar Granville</option>
          {dynamicOrgs.map(org => (
            <option key={org.id} value={org.slug}>🏛 {org.name}{org.location ? ` — ${org.location}` : ''}</option>
          ))}
          <option value="centre">🏛 Other Centre / Organisation</option>
        </select>
      </div>

      {/* Host name */}
      <label>Host Name *</label>
      <input required
        placeholder={form.isOnBehalfOf ? "Enter the host's name" : 'Your name'}
        value={form.hostName} onChange={e => update('hostName', e.target.value)}
        readOnly={!!getCentreName(form.organiserType)} />

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
                fontWeight: calendarMode === mode ? 900 : 500, fontSize: '0.8125rem',
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
            <input type="date" required value={form.eventDate}
              aria-invalid={!!validationErrors.eventDate}
              onChange={e => {
                update('eventDate', e.target.value);
                setForm(p => ({
                  ...p,
                  enteredAsHijri: false,
                  hijriDay: null,
                  hijriMonth: null,
                  hijriYear: null,
                }));
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
                clearValidationError('eventDate');
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
        {validationErrors.eventDate && <p className="field-error">{validationErrors.eventDate}</p>}
      </div>
      )}

      <div className="row" style={{ marginTop: 4 }}>
        <div>
          <label>Start Time *</label>
          <input type="time" required value={form.startTime}
            aria-invalid={!!validationErrors.startTime}
            onChange={e => update('startTime', e.target.value)} />
          {validationErrors.startTime && <p className="field-error">{validationErrors.startTime}</p>}
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
            <div key={e.id} style={{ fontSize: '0.8125rem', color: '#78350f', marginBottom: 3 }}>
              · <strong>{e.eventTypeDisplay || e.eventType}</strong> by <strong>{e.hostName}</strong>
              {e.address?.suburb ? ` · ${e.address.suburb}` : ''} · {e.audienceType}
            </div>
          ))}
          <div style={{ fontSize: '0.75rem', color: '#92400e', marginTop: 6 }}>You can still save — this is a notice only.</div>
        </div>
      )}



      {/* Address */}
      <label>Address *</label>
      <AddressAutocomplete
        value={form.address}
        onChange={addr => {
          setForm(p => ({ ...p, address: addr }));
          clearValidationError('address');
        }}
        required
        invalid={!!validationErrors.address}
      />
      {validationErrors.address && <p className="field-error">{validationErrors.address}</p>}

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

      <label>
        Notes <span className="small">(optional)</span>
      </label>
      <textarea
        rows={3}
        maxLength={500}
        placeholder="Add instructions or information to include when this event is shared"
        value={form.notes || ''}
        onChange={e => update('notes', e.target.value)}
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
      <button type="submit" disabled={saving || uploadingImg}>
        {uploadingImg ? 'Uploading photo…' : saving ? 'Saving…' : submitLabel || (initialEvent?.id ? 'Update Event' : 'Add Event')}
      </button>
    </form>
  );
}
