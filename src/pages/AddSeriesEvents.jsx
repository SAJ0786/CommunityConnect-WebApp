import React, { useState, useCallback, useEffect } from 'react';
import EventForm from '../components/EventForm';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { getHijriDisplay } from '../services/hijriService';

export default function AddSeriesEvents({ user, profile, setPage }) {
  const [calType,     setCalType]     = useState('gregorian');
  const [startDate,   setStartDate]   = useState('');
  const [endDate,     setEndDate]     = useState('');
  const [hStartDay,   setHStartDay]   = useState('');
  const [hStartMonth, setHStartMonth] = useState('');
  const [hStartYear,  setHStartYear]  = useState('');
  const [hEndDay,     setHEndDay]     = useState('');
  const [hEndMonth,   setHEndMonth]   = useState('');
  const [hEndYear,    setHEndYear]    = useState('');
  const [preview,     setPreview]     = useState([]);
  const [saving,      setSaving]      = useState(false);
  const [done,        setDone]        = useState(false);
  const [error,       setError]       = useState('');

  const HIJRI_MONTHS = ['Muharram','Safar','Rabi al-Awwal','Rabi al-Thani',
    'Jumada al-Awwal','Jumada al-Thani','Rajab',"Sha'ban",
    'Ramadan','Shawwal',"Dhu al-Qi'dah",'Dhu al-Hijjah'];

  // Convert Hijri to Gregorian using browser Intl API
  const hijriToGreg = useCallback((day, month, year) => {
    if (!day || !month || !year) return '';
    try {
      // Use a lookup approach - find the Gregorian date where Hijri matches
      // Start from approximate Gregorian date
      const d = parseInt(day), m = parseInt(month), y = parseInt(year);
      if (isNaN(d) || isNaN(m) || isNaN(y)) return '';
      // Approximate: 1 Hijri year ≈ 354.37 days, epoch offset ≈ 227015 days
      const jd = Math.floor((11*y + 3) / 30) + 354*y + 30*m - Math.floor((m-1)/2) + d + 1948440 - 385;
      const l = jd + 68569;
      const n = Math.floor(4*l/146097);
      const ll = l - Math.floor((146097*n+3)/4);
      const i = Math.floor(4000*(ll+1)/1461001);
      const lll = ll - Math.floor(1461*i/4) + 31;
      const j = Math.floor(80*lll/2447);
      const gDay = lll - Math.floor(2447*j/80);
      const e = Math.floor(j/11);
      const gMonth = j + 2 - 12*e;
      const gYear = 100*(n-49) + i + e;
      return `${gYear}-${String(gMonth).padStart(2,'0')}-${String(gDay).padStart(2,'0')}`;
    } catch { return ''; }
  }, []);

  // Compute effective Gregorian dates — memoised to avoid infinite loop in useEffect
  const getStart = useCallback(() =>
    calType === 'gregorian' ? startDate : hijriToGreg(hStartDay, hStartMonth, hStartYear),
  [calType, startDate, hStartDay, hStartMonth, hStartYear, hijriToGreg]);

  const getEnd = useCallback(() =>
    calType === 'gregorian' ? endDate : hijriToGreg(hEndDay, hEndMonth, hEndYear),
  [calType, endDate, hEndDay, hEndMonth, hEndYear, hijriToGreg]);

  useEffect(() => {
    const start = getStart();
    const end   = getEnd();
    if (!start || !end || end < start) { setPreview([]); return; }
    const dates = [];
    const cur   = new Date(start + 'T00:00:00');
    const fin   = new Date(end   + 'T00:00:00');
    while (cur <= fin && dates.length < 60) {
      dates.push(cur.toISOString().slice(0, 10));
      cur.setDate(cur.getDate() + 1);
    }
    setPreview(dates);
  }, [getStart, getEnd]);

  const handleSubmit = async (eventDataFromForm) => {
    const start = getStart();
    const end   = getEnd();
    if (!start || !end)      { setError('Please enter valid start and end dates.'); return; }
    if (preview.length === 0) { setError('Invalid date range.'); return; }
    setSaving(true); setError('');
    try {
      await Promise.all(preview.map(date => {
        let hijriDisplay = '';
        try { hijriDisplay = getHijriDisplay(date) || ''; } catch {}
        return addDoc(collection(db, 'events'), {
          ...eventDataFromForm,
          eventDate:       date,
          hijriDate:       hijriDisplay,
          enteredAsHijri:  calType === 'hijri',
          createdByUserId: user.uid,
          createdByName:   profile?.fullName || '',
          status:          'active',
          isSeries:        true,
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
      <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
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
              color:      calType === t ? 'white'       : 'var(--text)',
              border: `1.5px solid ${calType === t ? 'var(--teal)' : 'var(--border)'}`,
              borderRadius: 10, fontWeight: 600, fontSize: 13, cursor: 'pointer',
            }}>
              {t === 'gregorian' ? '📅 Gregorian' : '🌙 Hijri'}
            </button>
          ))}
        </div>

        {/* Gregorian date range */}
        {calType === 'gregorian' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label>Start date *</label>
              <input type="date" value={startDate}
                min={new Date().toISOString().slice(0,10)}
                onChange={e => setStartDate(e.target.value)} />
            </div>
            <div>
              <label>End date *</label>
              <input type="date" value={endDate}
                min={startDate || new Date().toISOString().slice(0,10)}
                onChange={e => setEndDate(e.target.value)} />
            </div>
          </div>
        )}

        {/* Hijri date range — explicit fields to avoid setState-in-array issue */}
        {calType === 'hijri' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {/* Start date */}
            <div>
              <label style={{ fontWeight: 600, fontSize: 13, display: 'block', marginBottom: 6 }}>
                Start date (Hijri) *
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1.5fr', gap: 6 }}>
                <input placeholder="Day" type="number" min="1" max="30" value={hStartDay}
                  onChange={e => setHStartDay(e.target.value)} />
                <select value={hStartMonth} onChange={e => setHStartMonth(e.target.value)}>
                  <option value="">Month</option>
                  {HIJRI_MONTHS.map((m,i) => <option key={i} value={i+1}>{m}</option>)}
                </select>
                <input placeholder="Year" type="number" min="1400" max="1500" value={hStartYear}
                  onChange={e => setHStartYear(e.target.value)} />
              </div>
              {effStart && <p style={{ fontSize: 11, color: 'var(--muted)', margin: '4px 0 0' }}>= {effStart}</p>}
            </div>
            {/* End date */}
            <div>
              <label style={{ fontWeight: 600, fontSize: 13, display: 'block', marginBottom: 6 }}>
                End date (Hijri) *
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1.5fr', gap: 6 }}>
                <input placeholder="Day" type="number" min="1" max="30" value={hEndDay}
                  onChange={e => setHEndDay(e.target.value)} />
                <select value={hEndMonth} onChange={e => setHEndMonth(e.target.value)}>
                  <option value="">Month</option>
                  {HIJRI_MONTHS.map((m,i) => <option key={i} value={i+1}>{m}</option>)}
                </select>
                <input placeholder="Year" type="number" min="1400" max="1500" value={hEndYear}
                  onChange={e => setHEndYear(e.target.value)} />
              </div>
              {effEnd && <p style={{ fontSize: 11, color: 'var(--muted)', margin: '4px 0 0' }}>= {effEnd}</p>}
            </div>
          </div>
        )}

        {/* Preview */}
        {preview.length > 0 && (
          <div style={{ background: 'var(--teal-l,#e6f4f1)', borderRadius: 10, padding: '8px 12px', marginTop: 12 }}>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--teal)', fontWeight: 600 }}>
              ✅ {preview.length} event{preview.length !== 1 ? 's' : ''} will be created
              {preview.length === 60 && ' (maximum 60 days)'}
            </p>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--muted)' }}>
              {preview.slice(0,5).join(', ')}{preview.length > 5 ? ` … ${preview[preview.length-1]}` : ''}
            </p>
          </div>
        )}
        {endDate && startDate && endDate < startDate && (
          <p style={{ color: 'var(--danger,#dc2626)', fontSize: 13, marginTop: 8 }}>End date must be after start date.</p>
        )}
        {error && <p style={{ color: 'var(--danger,#dc2626)', fontSize: 13, marginTop: 8 }}>{error}</p>}
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
