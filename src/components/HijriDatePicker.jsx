import React, { useEffect, useState, useMemo } from 'react';
import { HIJRI_MONTHS, hijriToGregorian, hijriDisplayFromParts, getHijriParts, getHijriMonthLength } from '../services/hijriService';
import { getHijriSettings } from '../services/settingsService';

const SEL_STYLE = {
  flex: 1, padding: '10px 8px', fontSize: '0.875rem',
  border: '1px solid var(--border)', borderRadius: 10,
  background: 'var(--cc-surface)', color: 'var(--text)',
  marginTop: 0, marginBottom: 0,
};

export default function HijriDatePicker({ value = {}, onChange, overrides: overridesProp = [] }) {

  // ── Load overrides from Firestore (merge with any prop overrides) ────────
  const [overrides, setOverrides] = useState(overridesProp || []);
  useEffect(() => {
    getHijriSettings()
      .then(s => setOverrides(s.overrides || []))
      .catch(() => setOverrides(overridesProp || []));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Today's Hijri — recomputed whenever overrides are ready ─────────────
  const today = useMemo(() => {
    try {
      const h = getHijriParts(new Date(), overrides);
      return { d: h.day || 1, m: h.month || 1, y: h.year || 1447 };
    } catch { return { d: 1, m: 1, y: 1447 }; }
  }, [overrides]); // re-runs when overrides load

  const YEARS = useMemo(() =>
    Array.from({ length: 10 }, (_, i) => today.y - 2 + i),
  [today.y]);

  // ── State — initialise to today if no value passed ───────────────────────
  const [day,        setDay]        = useState(value.hDay   ? String(value.hDay)   : '');
  const [month,      setMonth]      = useState(value.hMonth ? String(value.hMonth) : '');
  const [year,       setYear]       = useState(value.hYear  ? String(value.hYear)  : '');
  const [gregResult, setGregResult] = useState('');
  const [error,      setError]      = useState('');
  const [todayReady, setTodayReady] = useState(false);

  const daysInSelectedMonth = useMemo(() => {
    const len = getHijriMonthLength(Number(year || today.y), Number(month || today.m), overrides);
    return len === 29 ? 29 : 30;
  }, [year, month, today.y, today.m, overrides]);

  const DAYS = useMemo(
    () => Array.from({ length: daysInSelectedMonth }, (_, i) => i + 1),
    [daysInSelectedMonth]
  );

  useEffect(() => {
    if (Number(day) > daysInSelectedMonth) setDay(String(daysInSelectedMonth));
  }, [day, daysInSelectedMonth]);

  // Once overrides load, set initial day/month/year to today if not provided
  useEffect(() => {
    if (overrides.length >= 0 && !todayReady) {
      setTodayReady(true);
      if (!value.hDay)   setDay(String(today.d));
      if (!value.hMonth) setMonth(String(today.m));
      if (!value.hYear)  setYear(String(today.y));
    }
  }, [today]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Core year-calc: given day+month what year should it be? ─────────────
  function calcYear(d, m) {
    if (m > today.m) return today.y;
    if (m < today.m) return today.y + 1;
    if (d >= today.d) return today.y;
    return today.y + 1;
  }

  // ── Day change ────────────────────────────────────────────────────────────
  function handleDayChange(e) {
    const selD = parseInt(e.target.value);
    if (isNaN(selD)) { setDay(e.target.value); return; }
    const selM = parseInt(month);

    let newM = selM;
    let newY = calcYear(selD, selM);

    // day < today AND in today's month → bump month forward
    if (selD < today.d && selM === today.m) {
      newM = today.m < 12 ? today.m + 1 : 1;
      newY = today.m === 12 ? today.y + 1 : today.y;
    }

    setDay(String(selD));
    setMonth(String(newM));
    setYear(String(newY));
  }

  // ── Month change ──────────────────────────────────────────────────────────
  function handleMonthChange(e) {
    const selM = parseInt(e.target.value);
    if (isNaN(selM)) { setMonth(e.target.value); return; }
    const selD = day ? parseInt(day) : today.d;
    const newY = calcYear(selD, selM);
    setMonth(String(selM));
    setYear(String(newY));
  }

  // ── Gregorian conversion + onChange ──────────────────────────────────────
  useEffect(() => {
    if (day && month && year) {
      const greg = hijriToGregorian(Number(day), Number(month), Number(year), overrides);
      if (greg) {
        setGregResult(new Date(greg + 'T00:00:00').toLocaleDateString('en-AU', {
          weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
        }));
        setError('');
        onChange({
          hDay:          Number(day),
          hMonth:        Number(month),
          hYear:         Number(year),
          gregorianDate: greg,
          displayStr:    hijriDisplayFromParts(Number(day), Number(month), Number(year))
        });
      } else {
        setGregResult('');
        setError('Could not convert this Hijri date. Please check the day/month/year.');
      }
    } else {
      setGregResult('');
    }
  }, [day, month, year, overrides]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginTop: 6, marginBottom: 6 }}>
        {/* Day */}
        <select value={day} onChange={handleDayChange} style={SEL_STYLE} required>
          <option value="">Day</option>
          {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
        </select>

        {/* Month */}
        <select value={month} onChange={handleMonthChange} style={{ ...SEL_STYLE, flex: 2 }} required>
          <option value="">Month</option>
          {HIJRI_MONTHS.map(m => (
            <option key={m.value} value={m.value}>{m.name}</option>
          ))}
        </select>

        {/* Year */}
        <select value={year} onChange={e => setYear(e.target.value)} style={SEL_STYLE} required>
          {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {gregResult && (
        <p style={{ fontSize: '0.75rem', color: 'var(--teal)', margin: '2px 0 8px', fontWeight: 700 }}>
          📅 Gregorian: {gregResult}
        </p>
      )}
      {error && (
        <p style={{ fontSize: '0.75rem', color: 'var(--danger)', margin: '2px 0 8px' }}>
          ⚠️ {error}
        </p>
      )}
    </div>
  );
}
