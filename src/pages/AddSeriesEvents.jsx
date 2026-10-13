import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import EventForm from '../components/EventForm';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { getHijriDisplay, getHijriParts, hijriToGregorian, hijriDisplayFromParts } from '../services/hijriService';
import { getHijriSettings } from '../services/settingsService';
import { classifyMetroArea } from '../utils/cities';
import { validateRequiredEventFields } from '../services/eventService';

export default function AddSeriesEvents({ user, profile, setPage }) {
  const [calType,   setCalType]   = useState('gregorian');
  const [startDate, setStartDate] = useState('');
  const [endDate,   setEndDate]   = useState('');

  // ── Overrides — loaded from Firestore on mount ───────────────────────────
  const [overrides,   setOverrides]   = useState([]);
  const [todayReady,  setTodayReady]  = useState(false);

  useEffect(() => {
    getHijriSettings()
      .then(s => {
        setOverrides(s.overrides || []);
        setTodayReady(true);
      })
      .catch(() => setTodayReady(true));
  }, []);

  // ── Today's Hijri — recomputed when overrides load ───────────────────────
  const today = useMemo(() => {
    try {
      const h = getHijriParts(new Date(), overrides);
      return { d: h.day || 1, m: h.month || 1, y: h.year || 1447 };
    } catch { return { d: 1, m: 1, y: 1447 }; }
  }, [overrides]);

  const HIJRI_MONTHS = ['Muharram','Safar','Rabi al-Awwal','Rabi al-Thani',
    'Jumada al-Awwal','Jumada al-Thani','Rajab',"Sha'ban",
    'Ramadan','Shawwal',"Dhu al-Qi'dah",'Dhu al-Hijjah'];

  // ── Start/End date state — set after overrides load ──────────────────────
  const [hStartDay,   setHStartDay]   = useState('');
  const [hStartMonth, setHStartMonth] = useState('');
  const [hStartYear,  setHStartYear]  = useState('');
  const [hEndDay,     setHEndDay]     = useState('');
  const [hEndMonth,   setHEndMonth]   = useState('');
  const [hEndYear,    setHEndYear]    = useState('');

  const endTouched = useRef(false);

  // Once overrides are ready, initialise start = today, end = today + 1
  useEffect(() => {
    if (!todayReady) return;
    setHStartDay(String(today.d));
    setHStartMonth(String(today.m));
    setHStartYear(String(today.y));

    // end = today + 1 day
    let ed = today.d + 1, em = today.m, ey = today.y;
    if (ed > 30) { ed = 1; em += 1; }
    if (em > 12) { em = 1; ey += 1; }
    setHEndDay(String(ed));
    setHEndMonth(String(em));
    setHEndYear(String(ey));
  }, [todayReady]); // eslint-disable-line react-hooks/exhaustive-deps

  const [preview, setPreview] = useState([]);
  const [saving,  setSaving]  = useState(false);
  const [done,    setDone]    = useState(false);
  const [error,   setError]   = useState('');

  // ── Hijri → Gregorian (with overrides) ───────────────────────────────────
  // ── Override-aware Hijri → Gregorian conversion ─────────────────────────
  const hijriToGregWithOverrides = useCallback((day, month, year) => {
    if (!day || !month || !year) return '';
    try {
      return hijriToGregorian(parseInt(day), parseInt(month), parseInt(year), overrides) || '';
    } catch { return ''; }
  }, [overrides]);

  // ── Core year-calc (relative to today with overrides) ────────────────────
  function calcYear(d, m) {
    if (m > today.m) return today.y;
    if (m < today.m) return today.y + 1;
    if (d >= today.d) return today.y;
    return today.y + 1;
  }

  // ── Add 1 Hijri day ───────────────────────────────────────────────────────
  function plusOneDay(d, m, y) {
    let nd = d + 1, nm = m, ny = y;
    if (nd > 30) { nd = 1; nm += 1; }
    if (nm > 12) { nm = 1; ny += 1; }
    return { d: nd, m: nm, y: ny };
  }

  function addHijriDays(d, m, y, offset) {
    let cur = { d: parseInt(d), m: parseInt(m), y: parseInt(y) };
    for (let i = 0; i < offset; i += 1) cur = plusOneDay(cur.d, cur.m, cur.y);
    return cur;
  }

  // ── Push end = start + 1 ─────────────────────────────────────────────────
  function pushEndToStartPlusOne(sd, sm, sy) {
    const { d, m, y } = plusOneDay(parseInt(sd), parseInt(sm), parseInt(sy));
    setHEndDay(String(d));
    setHEndMonth(String(m));
    setHEndYear(String(y));
  }

  // ── START DATE handlers ───────────────────────────────────────────────────
  function handleStartDayChange(e) {
    const raw = e.target.value;
    if (raw === '') { setHStartDay(''); return; }
    let selD = parseInt(raw);
    if (isNaN(selD)) return;
    if (selD > 30) selD = 30;
    if (selD < 1)  selD = 1;
    const selM = parseInt(hStartMonth) || today.m;

    let newM = selM;
    let newY = calcYear(selD, selM);

    if (selD < today.d && selM === today.m) {
      newM = today.m < 12 ? today.m + 1 : 1;
      newY = today.m === 12 ? today.y + 1 : today.y;
    }

    setHStartDay(String(selD));
    setHStartMonth(String(newM));
    setHStartYear(String(newY));
    pushEndToStartPlusOne(selD, newM, newY);
  }

  function handleStartMonthChange(e) {
    const selM = parseInt(e.target.value);
    if (isNaN(selM)) { setHStartMonth(e.target.value); return; }
    const selD = hStartDay ? parseInt(hStartDay) : today.d;
    const newY = calcYear(selD, selM);
    setHStartMonth(String(selM));
    setHStartYear(String(newY));
    pushEndToStartPlusOne(selD, selM, newY);
  }

  function handleStartYearChange(e) {
    setHStartYear(e.target.value);
    pushEndToStartPlusOne(
      hStartDay   ? parseInt(hStartDay)   : today.d,
      hStartMonth ? parseInt(hStartMonth) : today.m,
      parseInt(e.target.value)
    );
  }

  // ── END DATE handlers ─────────────────────────────────────────────────────
  function handleEndDayChange(e) {
    endTouched.current = true;
    const raw = e.target.value;
    // Allow empty so the user can clear and retype
    if (raw === '') { setHEndDay(''); return; }
    let selD = parseInt(raw);
    if (isNaN(selD)) return;
    // Clamp to valid Hijri day range
    if (selD > 30) selD = 30;
    if (selD < 1)  selD = 1;
    const selM = parseInt(hEndMonth) || today.m;

    let newM = selM;
    let newY = calcYear(selD, selM);

    if (selD < today.d && selM === today.m) {
      newM = today.m < 12 ? today.m + 1 : 1;
      newY = today.m === 12 ? today.y + 1 : today.y;
    }

    setHEndDay(String(selD));
    setHEndMonth(String(newM));
    setHEndYear(String(newY));
  }

  function handleEndMonthChange(e) {
    endTouched.current = true;
    const selM = parseInt(e.target.value);
    if (isNaN(selM)) { setHEndMonth(e.target.value); return; }
    const selD = hEndDay ? parseInt(hEndDay) : today.d;
    const newY = calcYear(selD, selM);
    setHEndMonth(String(selM));
    setHEndYear(String(newY));
  }

  function handleEndYearChange(e) {
    endTouched.current = true;
    setHEndYear(e.target.value);
  }

  // ── Effective Gregorian dates ─────────────────────────────────────────────
  const getStart = useCallback(() =>
    calType === 'gregorian' ? startDate : hijriToGregWithOverrides(hStartDay, hStartMonth, hStartYear),
  [calType, startDate, hStartDay, hStartMonth, hStartYear, hijriToGregWithOverrides]);

  const getEnd = useCallback(() =>
    calType === 'gregorian' ? endDate : hijriToGregWithOverrides(hEndDay, hEndMonth, hEndYear),
  [calType, endDate, hEndDay, hEndMonth, hEndYear, hijriToGregWithOverrides]);

  // Auto-set gregorian end = start + 1
  useEffect(() => {
    if (calType === 'gregorian' && startDate) {
      const d = new Date(startDate + 'T00:00:00');
      d.setDate(d.getDate() + 1);
      setEndDate(d.toISOString().slice(0, 10));
    }
  }, [startDate, calType]);

  // ── Preview ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const start = getStart();
    const end   = getEnd();
    if (!start || !end || end < start) { setPreview([]); return; }
    const dates = [];
    const cur   = new Date(start + 'T00:00:00');
    const fin   = new Date(end   + 'T00:00:00');
    // Format in LOCAL time (not UTC) to avoid off-by-one for AU timezones
    const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    while (cur <= fin && dates.length < 60) {
      dates.push(fmt(cur));
      cur.setDate(cur.getDate() + 1);
    }
    setPreview(dates);
  }, [getStart, getEnd]);

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async (eventDataFromForm) => {
    const start = getStart();
    const end   = getEnd();
    if (!start || !end)       { setError('Please enter valid start and end dates.'); return; }
    if (preview.length === 0) { setError('Invalid date range.'); return; }
    try {
      validateRequiredEventFields({ ...eventDataFromForm, eventDate: preview[0] });
    } catch (validationError) {
      setError(validationError.message);
      return;
    }
    setSaving(true); setError('');
    try {
      const seriesId = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${user.uid}_${Date.now()}`;
      await Promise.all(preview.map((date, index) => {
        const anchoredHijri = calType === 'hijri'
          ? addHijriDays(hStartDay, hStartMonth, hStartYear, index)
          : null;
        let hijriDisplay = anchoredHijri
          ? hijriDisplayFromParts(anchoredHijri.d, anchoredHijri.m, anchoredHijri.y)
          : '';
        if (!hijriDisplay) {
          try { hijriDisplay = getHijriDisplay(date, overrides) || ''; } catch {}
        }
        let hijriComponents = {};
        if (anchoredHijri) {
          hijriComponents = {
            hijriDay: anchoredHijri.d,
            hijriMonth: anchoredHijri.m,
            hijriYear: anchoredHijri.y,
          };
        }
        return addDoc(collection(db, 'events'), {
          ...eventDataFromForm,
          metroArea:       classifyMetroArea(eventDataFromForm.address),
          eventDate:       date,
          hijriDate:       hijriDisplay,
          enteredAsHijri:  calType === 'hijri',
          ...hijriComponents,
          createdByUserId: user.uid,
          createdByName:   profile?.fullName || '',
          status:          'active',
          isSeries:        true,
          seriesId,
          seriesStartDate: start,
          seriesEndDate:   end,
          createdAt:       serverTimestamp(),
          updatedAt:       serverTimestamp(),
        });
      }));
      setDone(true);
    } catch (e) { setError('Error saving series: ' + e.message); }
    setSaving(false);
  };

  if (done) return (
    <div className="card center" style={{ marginTop: 32 }}>
      <div style={{ fontSize: '3rem', marginBottom: 12 }}>✅</div>
      <h3 style={{ margin: '0 0 8px' }}>Series Created!</h3>
      <p className="small" style={{ color: 'var(--muted)', marginBottom: 16 }}>
        {preview.length} events added from {getStart()} to {getEnd()}.
      </p>
      <button onClick={() => setPage('home')}>Back to Home</button>
    </div>
  );

  const effStart = getStart();
  const effEnd   = getEnd();

  return (
    <>
      <div className="card">
        <h2 style={{ margin: '0 0 4px' }}>📅 Add Series Events</h2>
        <p className="small" style={{ margin: '0 0 16px', color: 'var(--muted)' }}>
          Add the same event across consecutive days. Select the date range then complete the event details once.
        </p>

        {/* Calendar type toggle */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {['gregorian','hijri'].map(t => (
            <button key={t} type="button" onClick={() => setCalType(t)} style={{
              flex: 1, padding: '8px',
              background: calType === t ? 'var(--teal)' : 'transparent',
              color:      calType === t ? 'var(--cc-on-primary)'       : 'var(--text)',
              border: `1.5px solid ${calType === t ? 'var(--teal)' : 'var(--border)'}`,
              borderRadius: 10, fontWeight: 600, fontSize: '0.8125rem', cursor: 'pointer',
            }}>
              {t === 'gregorian' ? '📅 Gregorian' : '🌙 Hijri'}
            </button>
          ))}
        </div>

        {/* Gregorian date range */}
        {calType === 'gregorian' && (
          <div className="row">
            <div>
              <label>Start date *</label>
              <input type="date" value={startDate}
                min={new Date().toISOString().slice(0,10)}
                onChange={e => setStartDate(e.target.value)} />
            </div>
            <div>
              <label>End date *</label>
              <input type="date" value={endDate}
                min={startDate
                  ? new Date(new Date(startDate+'T00:00:00').getTime()+86400000).toISOString().slice(0,10)
                  : new Date().toISOString().slice(0,10)}
                onChange={e => setEndDate(e.target.value)} />
            </div>
          </div>
        )}

        {/* Hijri date range */}
        {calType === 'hijri' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Loading state while overrides fetch */}
            {!todayReady && (
              <p style={{ fontSize: '0.8125rem', color: 'var(--muted)', textAlign: 'center' }}>
                🌙 Loading Hijri calendar settings…
              </p>
            )}

            {todayReady && (<>
            {/* Start */}
            <div>
              <label style={{ fontWeight: 600, fontSize: '0.8125rem', display: 'block', marginBottom: 6 }}>
                Start date (Hijri) *
              </label>
              <div className="cc-hijri-fields">
                <input placeholder="Day" type="number" min="1" max="30" value={hStartDay}
                  onChange={handleStartDayChange}
                  style={{ padding: '10px 8px', fontSize: '0.875rem', border: '1px solid var(--border)', borderRadius: 10 }} />
                <select value={hStartMonth} onChange={handleStartMonthChange}
                  style={{ padding: '10px 8px', fontSize: '0.875rem', border: '1px solid var(--border)', borderRadius: 10 }}>
                  <option value="">Month</option>
                  {HIJRI_MONTHS.map((m,i) => <option key={i} value={i+1}>{m}</option>)}
                </select>
                <input placeholder="Year" type="number" min="1400" max="1500" value={hStartYear}
                  onChange={handleStartYearChange}
                  style={{ padding: '10px 8px', fontSize: '0.875rem', border: '1px solid var(--border)', borderRadius: 10 }} />
              </div>
              {effStart && <p style={{ fontSize: '0.6875rem', color: 'var(--muted)', margin: '4px 0 0' }}>= {effStart}</p>}
            </div>

            {/* End */}
            <div>
              <label style={{ fontWeight: 600, fontSize: '0.8125rem', display: 'block', marginBottom: 6 }}>
                End date (Hijri) *
              </label>
              <div className="cc-hijri-fields">
                <input placeholder="Day" type="number" min="1" max="30" value={hEndDay}
                  onChange={handleEndDayChange}
                  style={{ padding: '10px 8px', fontSize: '0.875rem', border: '1px solid var(--border)', borderRadius: 10 }} />
                <select value={hEndMonth} onChange={handleEndMonthChange}
                  style={{ padding: '10px 8px', fontSize: '0.875rem', border: '1px solid var(--border)', borderRadius: 10 }}>
                  <option value="">Month</option>
                  {HIJRI_MONTHS.map((m,i) => <option key={i} value={i+1}>{m}</option>)}
                </select>
                <input placeholder="Year" type="number" min="1400" max="1500" value={hEndYear}
                  onChange={handleEndYearChange}
                  style={{ padding: '10px 8px', fontSize: '0.875rem', border: '1px solid var(--border)', borderRadius: 10 }} />
              </div>
              {effEnd && <p style={{ fontSize: '0.6875rem', color: 'var(--muted)', margin: '4px 0 0' }}>= {effEnd}</p>}
            </div>
            </>)}
          </div>
        )}

        {/* Preview */}
        {preview.length > 0 && (
          <div style={{ background: 'var(--teal-l,var(--cc-accent-soft))', borderRadius: 10, padding: '8px 12px', marginTop: 12 }}>
            <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--teal)', fontWeight: 600 }}>
              ✅ {preview.length} event{preview.length !== 1 ? 's' : ''} will be created
              {preview.length === 60 && ' (maximum 60 days)'}
            </p>
            <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: 'var(--muted)' }}>
              {(() => {
                // In Hijri mode, show Hijri dates; otherwise Gregorian
                const fmt = (d) => calType === 'hijri'
                  ? (getHijriDisplay(d, overrides) || d)
                  : d;
                const shown = preview.slice(0, 5).map(fmt);
                const last = fmt(preview[preview.length - 1]);
                return `${shown.join(', ')}${preview.length > 5 ? ` … ${last}` : ''}`;
              })()}
            </p>
          </div>
        )}
        {effEnd && effStart && effEnd < effStart && (
          <p style={{ color: 'var(--danger,var(--cc-danger))', fontSize: '0.8125rem', marginTop: 8 }}>End date must be after start date.</p>
        )}
        {error && <p style={{ color: 'var(--danger,var(--cc-danger))', fontSize: '0.8125rem', marginTop: 8 }}>{error}</p>}
      </div>

      {preview.length > 0 && (
        <EventForm
          user={user} profile={profile}
          initialDate={effStart}
          seriesMode={true}
          saving={saving}
          onSubmit={handleSubmit}
          onCancel={() => setPage('home')}
          submitLabel={saving
            ? `Creating ${preview.length} events…`
            : `✅ Create ${preview.length} Event${preview.length !== 1 ? 's' : ''}`}
        />
      )}
    </>
  );
}
