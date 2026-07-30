import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import EventForm from '../components/EventForm';
import { db } from '../firebase/firebase';
import { getHijriParts, HIJRI_MONTHS } from '../services/hijriService';
import { getHijriSettings } from '../services/settingsService';
import { validateRequiredEventFields } from '../services/eventService';
import {
  formatLocalDate,
  generateGregorianOccurrences,
  generateHijriOccurrences,
  parseLocalDate,
  recurrenceLabel,
} from '../services/recurrenceService';
import { classifyMetroArea } from '../utils/cities';
import { applyPrayerOffset, calculatePrayerTimes, prayerLabel } from '../services/prayerTimeService';

const FREQUENCY_OPTIONS = [
  { value: 'day', label: 'Daily' },
  { value: 'week', label: 'Weekly' },
  { value: 'month', label: 'Monthly' },
  { value: 'year', label: 'Yearly' },
];

function addYears(date, years) {
  const next = new Date(date);
  next.setFullYear(next.getFullYear() + years);
  return next;
}

function defaultEndDateFor(frequency, startDate) {
  const start = parseLocalDate(startDate) || new Date();
  return formatLocalDate(frequency === 'year' ? addYears(start, 4) : addYears(start, 1));
}

function normaliseStartDate() {
  return formatLocalDate(new Date());
}

function DatePreview({ occurrences, calendarType }) {
  if (!occurrences.length) return null;
  const firstTen = occurrences.slice(0, 10);
  return (
    <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 12, background: '#e6f4f1', border: '1px solid #b7ded7' }}>
      <div style={{ fontWeight: 900, color: 'var(--teal)', marginBottom: 8 }}>
        Preview: {occurrences.length} event{occurrences.length === 1 ? '' : 's'} will be created
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {firstTen.map((item, index) => (
          <span key={`${item.eventDate}-${index}`} style={{
            fontSize: '0.75rem',
            fontWeight: 800,
            padding: '5px 8px',
            borderRadius: 999,
            background: 'white',
            color: 'var(--text)',
            border: '1px solid var(--border)',
          }}>
            {calendarType === 'hijri' ? item.hijriDate : item.eventDate}
          </span>
        ))}
        {occurrences.length > firstTen.length && (
          <span style={{ fontSize: '0.75rem', fontWeight: 800, padding: '5px 8px', color: 'var(--muted)' }}>
            +{occurrences.length - firstTen.length} more
          </span>
        )}
      </div>
    </div>
  );
}

export default function AddRecurringEvent({ user, profile, setPage, onSaved }) {
  const today = normaliseStartDate();
  const [calendarType, setCalendarType] = useState('gregorian');
  const [startDate, setStartDate] = useState(today);
  const [frequency, setFrequency] = useState('week');
  const [repeatEvery, setRepeatEvery] = useState(1);
  const [endMode, setEndMode] = useState('count');
  const [endDate, setEndDate] = useState(defaultEndDateFor('week', today));
  const [occurrenceCount, setOccurrenceCount] = useState(4);
  const [overrides, setOverrides] = useState([]);
  const [settingsReady, setSettingsReady] = useState(false);
  const [hijriStart, setHijriStart] = useState({ day: '', month: '', year: '' });
  const [hijriEnd, setHijriEnd] = useState({ day: '', month: '', year: '' });
  const [saving, setSaving] = useState(false);
  const [doneCount, setDoneCount] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    getHijriSettings()
      .then(settings => {
        const loadedOverrides = settings.overrides || [];
        setOverrides(loadedOverrides);
        const todayHijri = getHijriParts(new Date(), loadedOverrides);
        const year = todayHijri.year || 1448;
        const month = todayHijri.month || 1;
        const day = todayHijri.day || 1;
        setHijriStart({ day: String(day), month: String(month), year: String(year) });
        setHijriEnd({ day: String(Math.min(day + 29, 30)), month: String(month), year: String(year) });
      })
      .catch(() => {
        setHijriStart({ day: '1', month: '1', year: '1448' });
        setHijriEnd({ day: '30', month: '1', year: '1448' });
      })
      .finally(() => setSettingsReady(true));
  }, []);

  useEffect(() => {
    setEndDate(defaultEndDateFor(frequency, startDate));
    if (frequency === 'year' && Number(occurrenceCount) > 5) setOccurrenceCount(5);
  }, [frequency, startDate]); // eslint-disable-line react-hooks/exhaustive-deps

  const previewResult = useMemo(() => {
    if (!settingsReady) return { occurrences: [], error: '' };
    try {
      const occurrences = calendarType === 'hijri'
        ? generateHijriOccurrences({
            startHijri: hijriStart,
            frequency,
            repeatEvery,
            endMode,
            endHijri: hijriEnd,
            occurrenceCount,
            overrides,
          })
        : generateGregorianOccurrences({
            startDate,
            frequency,
            repeatEvery,
            endMode,
            endDate,
            occurrenceCount,
            overrides,
          });
      return { occurrences, error: '' };
    } catch (err) {
      return { occurrences: [], error: err.message };
    }
  }, [calendarType, endDate, endMode, frequency, hijriEnd, hijriStart, occurrenceCount, overrides, repeatEvery, settingsReady, startDate]);

  const occurrences = previewResult.occurrences;
  const previewError = previewResult.error;

  const saveRecurringEvents = async eventDataFromForm => {
    if (!occurrences.length) {
      setError(previewError || 'Please set a valid recurrence schedule.');
      return;
    }
    try {
      validateRequiredEventFields({ ...eventDataFromForm, eventDate: occurrences[0].eventDate });
    } catch (validationError) {
      setError(validationError.message);
      return;
    }

    setSaving(true);
    setError('');
    try {
      const seriesId = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `recurring_${user.uid}_${Date.now()}`;
      const start = occurrences[0].eventDate;
      const end = occurrences[occurrences.length - 1].eventDate;
      const sharedEventData = {
        ...eventDataFromForm,
        metroArea: classifyMetroArea(eventDataFromForm.address),
        createdByUserId: user.uid,
        createdByName: profile?.fullName || '',
        createdByUserEmail: user?.email || profile?.email || '',
        submittedByName: profile?.fullName || user?.displayName || user?.email || '',
        submittedByRole: profile?.role || 'user',
        status: 'active',
        hidden: false,
        isSeries: true,
        isRecurring: true,
        seriesId,
        recurringSeriesId: seriesId,
        seriesStartDate: start,
        seriesEndDate: end,
        recurrenceRuleSnapshot: {
          calendarType,
          frequency,
          repeatEvery: Number(repeatEvery),
          endMode,
          endDate: endMode === 'date' ? (calendarType === 'hijri' ? null : endDate) : null,
          endHijri: endMode === 'date' && calendarType === 'hijri' ? hijriEnd : null,
          occurrenceCount: endMode === 'count' ? Number(occurrenceCount) : null,
        },
      };

      for (let offset = 0; offset < occurrences.length; offset += 450) {
        const batch = writeBatch(db);
        occurrences.slice(offset, offset + 450).forEach((occurrence, indexInChunk) => {
          const index = offset + indexInChunk;
          const prayerTimes = eventDataFromForm.timeMode === 'prayer'
            ? calculatePrayerTimes(occurrence.eventDate, eventDataFromForm.address)
            : null;
          const prayerName = eventDataFromForm.prayerName || '';
          const prayerOffsetMinutes = Number(eventDataFromForm.prayerOffsetMinutes || 0);
          const occurrenceStartTime = prayerTimes?.[prayerName]
            ? applyPrayerOffset(prayerTimes[prayerName], prayerOffsetMinutes)
            : eventDataFromForm.startTime;
          const eventRef = doc(collection(db, 'events'));
          batch.set(eventRef, {
            ...sharedEventData,
            eventDate: occurrence.eventDate,
            startTime: occurrenceStartTime,
            prayerLabel: prayerName ? prayerLabel(prayerName) : '',
            prayerOffsetMinutes,
            prayerTimeZone: prayerTimes?.timeZone || eventDataFromForm.prayerTimeZone || '',
            hijriDate: occurrence.hijriDate,
            hijriDay: occurrence.hijriDay || null,
            hijriMonth: occurrence.hijriMonth || null,
            hijriYear: occurrence.hijriYear || null,
            enteredAsHijri: occurrence.enteredAsHijri,
            recurrenceIndex: index + 1,
            recurrenceTotal: occurrences.length,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        });
        await batch.commit();
      }

      await setDoc(doc(db, 'recurringEventSeries', seriesId), {
        id: seriesId,
        ownerUid: user.uid,
        ownerName: profile?.fullName || '',
        ownerEmail: user?.email || profile?.email || '',
        title: `${eventDataFromForm.eventTypeDisplay || eventDataFromForm.eventType || 'Event'} - ${eventDataFromForm.hostName || ''}`.trim(),
        status: 'active',
        startDate: start,
        endDate: end,
        totalEvents: occurrences.length,
        rule: sharedEventData.recurrenceRuleSnapshot,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      if (onSaved) {
        await onSaved(`${occurrences.length} recurring event${occurrences.length === 1 ? '' : 's'} added successfully.`);
      } else {
        setDoneCount(occurrences.length);
      }
    } catch (err) {
      setError(`Error saving recurring events: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (doneCount > 0) {
    return (
      <div className="card center" style={{ marginTop: 32 }}>
        <div style={{ fontSize: '3rem', marginBottom: 12 }}>✅</div>
        <h3 style={{ margin: '0 0 8px' }}>Recurring Events Created</h3>
        <p className="small" style={{ color: 'var(--muted)', marginBottom: 16 }}>
          {doneCount} event{doneCount === 1 ? '' : 's'} added successfully.
        </p>
        <button type="button" onClick={() => {
          if (onSaved) onSaved();
          else setPage('home');
        }}>Back to Home</button>
      </div>
    );
  }

  return (
    <>
      <div className="card">
        <h2 style={{ margin: '0 0 6px' }}>Recurring Event</h2>
        <p className="small" style={{ margin: '0 0 16px', color: 'var(--muted)' }}>
          Create repeating events from one shared set of details. Dates are previewed before saving.
        </p>

        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {['gregorian', 'hijri'].map(type => (
            <button key={type} type="button" className={calendarType === type ? '' : 'btn-light'}
              onClick={() => setCalendarType(type)}
              style={{ flex: 1, margin: 0 }}>
              {type === 'gregorian' ? 'Gregorian' : 'Hijri'}
            </button>
          ))}
        </div>

        {calendarType === 'gregorian' ? (
          <div className="row">
            <div>
              <label>First event date *</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            {endMode === 'date' && (
              <div>
                <label>End date *</label>
                <input type="date" value={endDate} min={startDate} onChange={e => setEndDate(e.target.value)} />
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            <div>
              <label>First event Hijri date *</label>
              <div style={{ display: 'grid', gridTemplateColumns: '72px 1fr 92px', gap: 8 }}>
                <input type="number" min="1" max="30" value={hijriStart.day} onChange={e => setHijriStart(p => ({ ...p, day: e.target.value }))} />
                <select value={hijriStart.month} onChange={e => setHijriStart(p => ({ ...p, month: e.target.value }))}>
                  <option value="">Month</option>
                  {HIJRI_MONTHS.map(month => <option key={month.value} value={month.value}>{month.name}</option>)}
                </select>
                <input type="number" min="1400" max="1600" value={hijriStart.year} onChange={e => setHijriStart(p => ({ ...p, year: e.target.value }))} />
              </div>
            </div>
            {endMode === 'date' && (
              <div>
                <label>End Hijri date *</label>
                <div style={{ display: 'grid', gridTemplateColumns: '72px 1fr 92px', gap: 8 }}>
                  <input type="number" min="1" max="30" value={hijriEnd.day} onChange={e => setHijriEnd(p => ({ ...p, day: e.target.value }))} />
                  <select value={hijriEnd.month} onChange={e => setHijriEnd(p => ({ ...p, month: e.target.value }))}>
                    <option value="">Month</option>
                    {HIJRI_MONTHS.map(month => <option key={month.value} value={month.value}>{month.name}</option>)}
                  </select>
                  <input type="number" min="1400" max="1600" value={hijriEnd.year} onChange={e => setHijriEnd(p => ({ ...p, year: e.target.value }))} />
                </div>
              </div>
            )}
          </div>
        )}

        <div className="row" style={{ marginTop: 12 }}>
          <div>
            <label>Frequency *</label>
            <select value={frequency} onChange={e => setFrequency(e.target.value)}>
              {FREQUENCY_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
          <div>
            <label>Repeat every *</label>
            <input type="number" min="1" max="100" value={repeatEvery} onChange={e => setRepeatEvery(e.target.value)} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          {[
            ['count', 'Number of occurrences'],
            ['date', 'End date'],
          ].map(([value, label]) => (
            <button key={value} type="button" className={endMode === value ? '' : 'btn-light'}
              onClick={() => setEndMode(value)}
              style={{ flex: 1, margin: 0, fontSize: '0.8125rem' }}>
              {label}
            </button>
          ))}
        </div>

        {endMode === 'count' && (
          <div style={{ marginTop: 12 }}>
            <label>Occurrences *</label>
            <input type="number" min="1" max={frequency === 'year' ? '5' : '370'} value={occurrenceCount}
              onChange={e => setOccurrenceCount(e.target.value)} />
          </div>
        )}

        <p className="small" style={{ margin: '10px 0 0', color: 'var(--muted)' }}>
          {recurrenceLabel(frequency, repeatEvery)}. Daily, weekly and monthly events are limited to one year. Yearly events are limited to 5 occurrences.
        </p>

        {previewError && <div className="error" style={{ marginTop: 12 }}>{previewError}</div>}
        {error && <div className="error" style={{ marginTop: 12 }}>{error}</div>}
        <DatePreview occurrences={occurrences} calendarType={calendarType} />
      </div>

      {occurrences.length > 0 && (
        <EventForm
          user={user}
          profile={profile}
          initialDate={occurrences[0].eventDate}
          seriesMode={true}
          saving={saving}
          onSubmit={saveRecurringEvents}
          onCancel={() => setPage('home')}
          submitLabel={saving
            ? `Creating ${occurrences.length} events...`
            : `Create ${occurrences.length} recurring event${occurrences.length === 1 ? '' : 's'}`}
        />
      )}
    </>
  );
}
