import React, { useEffect, useId, useMemo, useState } from 'react';
import ReciterFields from './ReciterFields';
import HijriDatePicker from './HijriDatePicker';
import AddressAutocomplete from './AddressAutocomplete';
import { AUDIENCE_TYPES, EVENT_TYPES, RELIGIOUS_EVENT_TYPES } from '../utils/constants';
import { getHijriDisplay, getHijriParts, hijriDisplayFromParts } from '../services/hijriService';
import { getHijriSettings } from '../services/settingsService';
import { getOrganisations } from '../services/organisationsService';
import { uploadEventImage, getFallbackImage } from '../services/imageService';
import { applyPrayerOffset, calculatePrayerTimes, hasPrayerLocation, prayerLabel, PRAYER_OPTIONS } from '../services/prayerTimeService';

const BUILT_IN_CENTRE_NAMES = {
  muhammadi: 'Muhammadi Welfare Association',
  imamhasan: 'Imam Hasan Centre',
  alamdar: 'Alamdar Granville',
};
const EMPTY_EVENTS = [];

export default function EventForm({
  initialEvent, onSubmit, submitLabel = null,
  user, profile, existingEvents = EMPTY_EVENTS,
  seriesMode = false, saving = false, onCancel = null, initialDate = '',
  registrationMode = false, posterControls = null, notesMaxLength = 500
}) {
  const id = useId();
  const userName  = profile?.fullName  || user?.displayName || user?.email?.split('@')[0] || '';
  const userPhone = profile?.phone     || '';

  const blank = () => ({
    hostName:            userName,
    hostPhone:           userPhone,
    eventDate:           initialDate || '',
    startTime:           '',
    endTime:             '',
    timeMode:            'manual',
    prayerName:          '',
    prayerLabel:         '',
    prayerOffsetMinutes: 0,
    prayerTimeZone:      '',
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

  const [form, setForm]             = useState(() => ({ ...blank(), ...initialEvent }));
  const [overrides, setOverrides]   = useState([]);
  const [dynamicOrgs, setDynamicOrgs] = useState([]);
  const [duplicates, setDuplicates] = useState([]);
  const [validationErrors, setValidationErrors] = useState({});
  const [calendarMode, setCalendarMode] = useState(registrationMode && initialEvent?.enteredAsHijri ? 'hijri' : 'gregorian'); // 'gregorian' | 'hijri'
  const [hijriInput, setHijriInput]     = useState(() => registrationMode ? {
    hDay:initialEvent?.hijriDay, hMonth:initialEvent?.hijriMonth, hYear:initialEvent?.hijriYear,
  } : {});
  // Photo upload
  const [imagePreview, setImagePreview] = useState(initialEvent?.imageUrl || '');
  const [uploadingImg,  setUploadingImg] = useState(false);
  const [pendingFile,   setPendingFile]  = useState(null);

  const isCustom      = form.eventType === 'Custom';
  const showReligious = RELIGIOUS_EVENT_TYPES.includes(form.eventType);
  const prayerTimes = useMemo(
    () => calculatePrayerTimes(form.eventDate, form.address),
    [form.eventDate, form.address]
  );
  const canUsePrayerTime = !!prayerTimes;

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

  const setManualStartTime = value => {
    setForm(p => ({
      ...p,
      startTime: value,
      timeMode: 'manual',
      prayerName: '',
      prayerLabel: '',
      prayerOffsetMinutes: 0,
      prayerTimeZone: '',
    }));
    clearValidationError('startTime');
  };

  const setTimeMode = mode => {
    if (mode === 'prayer') {
      setForm(p => ({
        ...p,
        timeMode: 'prayer',
        startTime: p.prayerName && prayerTimes?.[p.prayerName]
          ? applyPrayerOffset(prayerTimes[p.prayerName], p.prayerOffsetMinutes || 0)
          : '',
        prayerTimeZone: prayerTimes?.timeZone || '',
      }));
      clearValidationError('startTime');
      return;
    }

    setForm(p => ({
      ...p,
      timeMode: 'manual',
      prayerName: '',
      prayerLabel: '',
      prayerOffsetMinutes: 0,
      prayerTimeZone: '',
    }));
  };

  const applyPrayerTime = (prayerName, offsetMinutes = form.prayerOffsetMinutes || 0) => {
    if (!prayerName || !prayerTimes?.[prayerName]) {
      setForm(p => ({ ...p, startTime: '', prayerName: '', prayerLabel: '', prayerTimeZone: '' }));
      return;
    }
    const adjustedTime = applyPrayerOffset(prayerTimes[prayerName], offsetMinutes);
    setForm(p => ({
      ...p,
      startTime: adjustedTime,
      timeMode: 'prayer',
      prayerName,
      prayerLabel: prayerLabel(prayerName),
      prayerOffsetMinutes: Number(offsetMinutes || 0),
      prayerTimeZone: prayerTimes.timeZone,
    }));
    clearValidationError('startTime');
  };

  const adjustPrayerOffset = delta => {
    const nextOffset = Math.max(-360, Math.min(360, Number(form.prayerOffsetMinutes || 0) + delta));
    if (form.prayerName) applyPrayerTime(form.prayerName, nextOffset);
    else setForm(p => ({ ...p, prayerOffsetMinutes: nextOffset }));
  };

  useEffect(() => {
    if (form.timeMode !== 'prayer') return;
    if (!form.prayerName || !prayerTimes?.[form.prayerName]) {
      if (!form.startTime && !form.prayerLabel && !form.prayerTimeZone) return;
      setForm(p => ({
        ...p,
        startTime: '',
        prayerLabel: '',
        prayerTimeZone: '',
      }));
      return;
    }
    const adjustedTime = applyPrayerOffset(prayerTimes[form.prayerName], form.prayerOffsetMinutes || 0);
    if (
      form.startTime === adjustedTime &&
      form.prayerTimeZone === prayerTimes.timeZone &&
      form.prayerLabel === prayerLabel(form.prayerName)
    ) return;
    setForm(p => ({
      ...p,
      startTime: adjustedTime,
      prayerLabel: prayerLabel(p.prayerName),
      prayerTimeZone: prayerTimes.timeZone,
    }));
  }, [form.prayerLabel, form.prayerName, form.prayerOffsetMinutes, form.prayerTimeZone, form.startTime, form.timeMode, prayerTimes]);

  const getDynamicOrgById = id => dynamicOrgs.find(org => org.id === id);
  const getDynamicOrgBySlug = slug => dynamicOrgs.find(org => org.slug === slug);

  const getSelectedOrganiserValue = () => {
    if (form.organiserId && getDynamicOrgById(form.organiserId)) return `org:${form.organiserId}`;
    return form.organiserType || 'private';
  };

  const getCentreName = organiserType => {
    if (!organiserType || organiserType === 'private' || organiserType === 'centre') return '';
    if (form.organiserId) return getDynamicOrgById(form.organiserId)?.name || '';
    return BUILT_IN_CENTRE_NAMES[organiserType]
      || getDynamicOrgBySlug(organiserType)?.name
      || '';
  };

  const handleOrganiserChange = value => {
    const selectedOrg = value?.startsWith('org:') ? getDynamicOrgById(value.slice(4)) : null;
    const organiserType = selectedOrg?.slug || value;
    const centreName = selectedOrg?.name || BUILT_IN_CENTRE_NAMES[organiserType] || '';
    setForm(p => ({
      ...p,
      organiserType,
      organiserId: selectedOrg?.id || '',
      organiserName: selectedOrg?.name || centreName || '',
      hostName: centreName || (p.isOnBehalfOf ? '' : userName),
    }));
  };

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
    if (form.timeMode === 'prayer' && !form.prayerName) {
      errors.startTime = 'Please select the prayer time for this event.';
    } else if (!form.startTime && !registrationMode) {
      errors.startTime = 'Please select the event start time.';
    }
    if (registrationMode && form.endTime && (!form.startTime || form.endTime === form.startTime)) {
      errors.startTime = 'End time requires a different start time. Earlier end times mean the following day.';
    }
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
    if (pendingFile && !registrationMode) {
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
      organiserName: getCentreName(form.organiserType) || form.organiserName || '',
      imageUrl,
      imagePath,
      eventTypeDisplay: resolvedType,    // human-readable label (e.g. "Aqeeqa")
      speakerName: showReligious ? form.speakerName : '',
      reciters:    showReligious ? (form.reciters || []).filter(r => r.name?.trim()) : [],
    });
  };

  return (
    <form className="card event-form" onSubmit={submit} noValidate>
      <h2>{registrationMode ? 'Event details' : initialEvent?.__editSeries ? 'Shared Series Details' : initialEvent ? 'Edit Event' : 'Add Event'}</h2>
      {Object.keys(validationErrors).length > 0 && (
        <div className="event-validation-summary" role="alert">
          <strong>Complete the highlighted mandatory fields:</strong>
          <ul>{Object.values(validationErrors).map(message => <li key={message}>{message}</li>)}</ul>
        </div>
      )}
      {initialEvent?.__editSeries && (
        <p className="small" style={{ marginTop:-8, color:'var(--muted)' }}>
          Shared details will be updated for the reviewed future occurrences. Each event keeps its own Gregorian and Hijri date.
        </p>
      )}

      {/* ── Event Poster ── */}
      {registrationMode ? posterControls : <><label>Upload Event Poster <span className="small" style={{ fontWeight: 400 }}>(optional)</span></label>
      {imagePreview ? (
        <div style={{ position: 'relative', borderRadius: 14, overflow: 'hidden',
          marginBottom: 14, marginTop: 4 }}>
          <img src={imagePreview} alt="Event"
            style={{ width: '100%', height: 180, objectFit: 'cover', display: 'block' }} />
          <button type="button" onClick={removePhoto} style={{
            position: 'absolute', top: 8, right: 8, width: 32, height: 32,
            borderRadius: '50%', background: 'color-mix(in srgb, var(--cc-overlay-base) 60%, transparent)', color: 'var(--cc-on-primary)',
            border: 'none', cursor: 'pointer', fontSize: '1rem', lineHeight: 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>×</button>
        </div>
      ) : (
        <label style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7,
          background: 'var(--bg,var(--cc-background))', border: '2px dashed var(--cc-border)',
          borderRadius: 14, padding: 22, cursor: 'pointer',
          color: 'var(--teal,var(--cc-accent-strong))', marginTop: 4, marginBottom: 14,
        }}>
          <span style={{ fontSize: '1.875rem' }}>📷</span>
          <span style={{ fontSize: '0.8125rem', fontWeight: 800 }}>Upload your event poster</span>
          <span style={{ fontSize: '0.6875rem', color: 'var(--muted)', textAlign: 'center' }}>
            Optional — if you don't, your organisation logo will be shown
          </span>
          <input type="file" accept="image/*" onChange={handlePhotoPick}
            style={{ display: 'none' }} />
        </label>
      )}</>}

      {/* On behalf of */}
      <label className="checkbox" style={{ marginBottom: 10 }}>
        <input type="checkbox" checked={!!form.isOnBehalfOf}
          onChange={e => toggleOnBehalf(e.target.checked)} />
        <span>I am adding this event on behalf of someone else</span>
      </label>

      {/* Organiser Type — private or specific organisation */}
      <div style={{ marginBottom: 14 }}>
        <label htmlFor={id + '-organiser'} style={{ display: 'block', marginBottom: 6 }}>
          Organiser Type
          <span className="small" style={{ marginLeft: 6, fontWeight: 400 }}>
            (Used to show the correct logo when no poster is uploaded)
          </span>
        </label>
        <select id={id + '-organiser'} value={getSelectedOrganiserValue()}
          onChange={e => handleOrganiserChange(e.target.value)}>
          <option value="private">🔒 Private (individual host)</option>
          <option value="muhammadi">🏛 Muhammadi Welfare Association</option>
          <option value="imamhasan">🏛 Imam Hasan Centre</option>
          <option value="alamdar">🏛 Alamdar Granville</option>
          {dynamicOrgs.map(org => (
            <option key={org.id} value={`org:${org.id}`}>🏛 {org.name}{org.location ? ` — ${org.location}` : ''}</option>
          ))}
          <option value="centre">🏛 Other Centre / Organisation</option>
        </select>
      </div>

      {/* Host name */}
      <label htmlFor={id + '-host'}>Host Name *</label>
      <input id={id + '-host'} required maxLength={registrationMode ? 80 : undefined}
        placeholder={form.isOnBehalfOf ? "Enter the host's name" : 'Your name'}
        value={form.hostName} onChange={e => update('hostName', e.target.value)}
        readOnly={!!getCentreName(form.organiserType)} />

      {/* Host phone — shown for all events */}
      <label htmlFor={id + '-phone'}>Host Phone Number <span className="small">(optional)</span></label>
      <input id={id + '-phone'}
        type="tel"
        maxLength={registrationMode ? 80 : undefined}
        placeholder="e.g. 0412 345 678"
        value={form.hostPhone || ''}
        onChange={e => update('hostPhone', e.target.value)}
      />

      {form.isOnBehalfOf && (
        <>
          <label htmlFor={id + '-email'}>Host Contact Email <span className="small">(optional)</span></label>
          <input id={id + '-email'} maxLength={registrationMode ? 254 : undefined} value={form.hostContactOptional || ''}
            onChange={e => update('hostContactOptional', e.target.value)}
            placeholder="Email of host (if different from phone above)" />
        </>
      )}

      {/* Date + time — hidden in series mode, date is controlled by AddSeriesEvents */}
      {!seriesMode && (
      <div style={{ marginBottom: 8 }}>
        <label htmlFor={id + '-date'} style={{ display: 'block', marginBottom: 6 }}>Date *</label>
        <div style={{ display: 'inline-flex', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden', background: 'var(--bg,var(--cc-background))', marginBottom: 8 }}>
          {['gregorian', 'hijri'].map(mode => (
            <button key={mode} type="button"
              onClick={() => setCalendarMode(mode)}
              style={{
                padding: '7px 16px', border: 'none', cursor: 'pointer',
                fontWeight: calendarMode === mode ? 900 : 500, fontSize: '0.8125rem',
                background: calendarMode === mode ? 'var(--teal)' : 'transparent',
                color:      calendarMode === mode ? 'var(--cc-on-primary)' : 'var(--muted)',
                transition: 'all .15s'
              }}>
              {mode === 'gregorian' ? '📅 Gregorian' : '🌙 Hijri'}
            </button>
          ))}
        </div>

        {calendarMode === 'gregorian' ? (
          <>
            <input id={id + '-date'} type="date" required value={form.eventDate}
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

      <div style={{ marginTop: 8, marginBottom: 12 }}>
        <label style={{ display: 'block', marginBottom: 6 }}>Time Selection{registrationMode ? ' (optional, event city timezone)' : ' *'}</label>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 8,
          border: '1px solid var(--border)',
          borderRadius: 14,
          padding: 6,
          background: 'var(--bg,var(--cc-background))',
        }}>
          <button type="button"
            className={form.timeMode === 'prayer' ? 'btn-light' : ''}
            onClick={() => setTimeMode('manual')}
            style={{ margin: 0 }}>
            Fixed Time
          </button>
          <button type="button"
            className={form.timeMode === 'prayer' ? '' : 'btn-light'}
            onClick={() => setTimeMode('prayer')}
            style={{ margin: 0 }}>
            Prayer Time (Variable)
          </button>
        </div>
      </div>

      {form.timeMode !== 'prayer' && (
        <div className="row" style={{ marginTop: 4 }}>
          <div>
            <label htmlFor={id + '-start-time'}>{registrationMode ? 'Start time (optional, event city timezone)' : 'Start Time *'}</label>
            <input id={id + '-start-time'} type="time" required={!registrationMode} value={form.startTime}
              aria-invalid={!!validationErrors.startTime}
              onChange={e => setManualStartTime(e.target.value)} />
            {validationErrors.startTime && <p className="field-error">{validationErrors.startTime}</p>}
          </div>
          <div>
            <label htmlFor={id + '-end-time'}>End Time <span className="small">(optional)</span></label>
            <input id={id + '-end-time'} type="time" value={form.endTime || ''}
              onChange={e => update('endTime', e.target.value)} />
          </div>
        </div>
      )}

      {registrationMode && <p>Leave times blank for a date-only event. An end time earlier than the start time means the following day. No default time or duration will be added.</p>}

      {/* Duplicate warning */}
      {duplicates.length > 0 && (
        <div style={{ background: 'var(--cc-warning-soft)', border: '1px solid var(--cc-warning)', borderRadius: 12, padding: '12px 14px', marginBottom: 12 }}>
          <div style={{ fontWeight: 800, color: 'var(--cc-warning-strong)', marginBottom: 6 }}>
            ⚠️ {duplicates.length} event{duplicates.length > 1 ? 's' : ''} already exist{duplicates.length === 1 ? 's' : ''} at this date and time:
          </div>
          {duplicates.map(e => (
            <div key={e.id} style={{ fontSize: '0.8125rem', color: 'var(--cc-warning-strong)', marginBottom: 3 }}>
              · <strong>{e.eventTypeDisplay || e.eventType}</strong> by <strong>{e.hostName}</strong>
              {e.address?.suburb ? ` · ${e.address.suburb}` : ''} · {e.audienceType}
            </div>
          ))}
          <div style={{ fontSize: '0.75rem', color: 'var(--cc-warning-strong)', marginTop: 6 }}>You can still save — this is a notice only.</div>
        </div>
      )}



      {/* Address */}
      <label>{registrationMode ? 'Private venue address *' : 'Address *'}</label>
      <AddressAutocomplete
        value={form.address}
        onChange={addr => {
          setForm(p => ({ ...p, address: addr }));
          clearValidationError('address');
        }}
        required
        invalid={!!validationErrors.address}
        label={registrationMode ? 'Private venue address' : undefined}
      />
      {validationErrors.address && <p className="field-error">{validationErrors.address}</p>}

      {form.timeMode === 'prayer' && (
        <div className="notice" style={{ marginTop: 10, marginBottom: 14 }}>
          <label htmlFor={id + '-prayer'} style={{ marginTop: 0 }}>Prayer Time *</label>
          <select
            id={id + '-prayer'}
            value={form.prayerName || ''}
            onChange={e => applyPrayerTime(e.target.value)}
            disabled={!canUsePrayerTime}
            aria-invalid={!!validationErrors.startTime}
          >
            <option value="">Select prayer time</option>
            {PRAYER_OPTIONS.map(option => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>

          <label style={{ marginTop: 12 }}>Offset</label>
          <div style={{ display: 'grid', gridTemplateColumns: '48px 1fr 48px', gap: 8, alignItems: 'center' }}>
            <button type="button" className="btn-light" onClick={() => adjustPrayerOffset(-30)} style={{ margin: 0 }}>-</button>
            <div style={{
              textAlign: 'center',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: '10px 12px',
              background: 'var(--cc-surface)',
              fontWeight: 900,
              color: 'var(--text)',
            }}>
              {Number(form.prayerOffsetMinutes || 0) > 0 ? '+' : ''}{Number(form.prayerOffsetMinutes || 0)} mins
            </div>
            <button type="button" className="btn-light" onClick={() => adjustPrayerOffset(30)} style={{ margin: 0 }}>+</button>
          </div>

          {canUsePrayerTime && form.prayerName && (
            <div style={{
              marginTop: 10,
              padding: '10px 12px',
              borderRadius: 12,
              background: 'color-mix(in srgb, var(--cc-accent-strong) 8%, transparent)',
              border: '1px solid color-mix(in srgb, var(--cc-accent-strong) 18%, transparent)',
              color: 'var(--text)',
            }}>
              <div style={{ fontWeight: 900 }}>
                {prayerLabel(form.prayerName)}: {prayerTimes[form.prayerName]}
              </div>
              <div className="small" style={{ marginTop: 3, color: 'var(--teal)', fontWeight: 900 }}>
                Event start time: {form.startTime || prayerTimes[form.prayerName]}
              </div>
            </div>
          )}
          {validationErrors.startTime && <p className="field-error">{validationErrors.startTime}</p>}
          <p className="small" style={{ margin: '6px 0 0', color: 'var(--muted)' }}>
            {canUsePrayerTime
              ? `Calculated from this event date and selected address GPS location (${prayerTimes.timeZone}).`
              : hasPrayerLocation(form.address)
                ? 'Select the event date first to calculate prayer times.'
                : 'Select the event date and choose a full address from Google suggestions before choosing prayer time.'}
          </p>
        </div>
      )}

      {/* Event type */}
      <label htmlFor={id + '-type'}>Event Type *</label>
      <select id={id + '-type'} value={form.eventType} onChange={e => handleEventTypeChange(e.target.value)}>
        {EVENT_TYPES.map(t => <option key={t}>{t}</option>)}
      </select>

      {/* Custom event type text box */}
      {isCustom && (
        <>
          <label htmlFor={id + '-custom-type'}>Custom Event Type *</label>
          <input id={id + '-custom-type'}
            required
            maxLength={registrationMode ? 100 : undefined}
            placeholder="e.g. Aqeeqa, Nikah, Dua, Commemoration…"
            value={form.customEventType || ''}
            onChange={e => update('customEventType', e.target.value)}
          />
        </>
      )}

      {/* Subject — optional, shown for all event types */}
      <label htmlFor={id + '-subject'}>
        Subject <span className="small">(optional)</span>
      </label>
      <input id={id + '-subject'}
        maxLength={registrationMode ? 160 : undefined}
        placeholder="e.g. Shahadat of Imam Hussain (A.S.), Birthday of…"
        value={form.eventSubject || ''}
        onChange={e => update('eventSubject', e.target.value)}
      />

      <label htmlFor={id + '-notes'}>
        Notes <span className="small">(optional)</span>
      </label>
      <textarea id={id + '-notes'}
        rows={3}
        maxLength={notesMaxLength}
        placeholder="Add instructions or information to include when this event is shared"
        value={form.notes || ''}
        onChange={e => update('notes', e.target.value)}
      />

      {/* Audience */}
      <label htmlFor={id + '-audience'}>Audience Type *</label>
      <select id={id + '-audience'} value={form.audienceType} onChange={e => update('audienceType', e.target.value)}>
        {AUDIENCE_TYPES.map(t => <option key={t}>{t}</option>)}
      </select>

      {/* Speaker + Reciters — Majlis, Milad, Custom */}
      {showReligious && (
        <div className="notice">
          <p className="small" style={{ margin: '0 0 10px' }}>
            Speaker and reciters available for <strong>{isCustom ? (form.customEventType || 'Custom') : form.eventType}</strong> events.
          </p>
          <label htmlFor={id + '-speaker'}>Speaker</label>
          <input id={id + '-speaker'} maxLength={registrationMode ? 160 : undefined} value={form.speakerName || ''} onChange={e => update('speakerName', e.target.value)} placeholder="Speaker name" />
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
