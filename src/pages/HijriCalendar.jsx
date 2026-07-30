import React, { useEffect, useMemo, useState } from 'react';
import {
  HIJRI_MONTHS,
  getCurrentHijriYear,
  getHijriDisplay,
  getHijriParts,
  hijriDisplayFromParts,
  hijriToGregorian,
} from '../services/hijriService';
import { getHijriSettings } from '../services/settingsService';
import {
  DEFAULT_HIJRI_OBSERVANCES,
  getHijriObservances,
  sortHijriObservances,
} from '../services/hijriObservanceService';

const CATEGORIES = ['All', 'Wiladat', 'Shahadat', 'Wafat', 'Eid', 'Ayyam-e-Aza', 'Amaal', 'Season', 'Event'];

function toIsoDate(date) {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function parseIsoDate(value) {
  const [year, month, day] = String(value || '').split('-').map(Number);
  return new Date(year || 2000, (month || 1) - 1, day || 1);
}

function formatDate(value, options = {}) {
  if (!value) return '';
  return parseIsoDate(value).toLocaleDateString('en-AU', {
    weekday: options.weekday || 'short',
    day: 'numeric',
    month: 'short',
    year: options.year || 'numeric',
  });
}

function monthName(month) {
  return HIJRI_MONTHS.find(m => Number(m.value) === Number(month))?.name || '';
}

function observanceTone(category = '') {
  if (['Wiladat', 'Eid'].includes(category)) return 'happy';
  if (['Shahadat', 'Wafat', 'Ayyam-e-Aza'].includes(category)) return 'sad';
  return 'occasion';
}

function getNextObservance(observances, overrides) {
  const today = toIsoDate(new Date());
  const currentYear = getCurrentHijriYear(overrides) || new Date().getFullYear() - 578;
  const candidates = [];

  for (const item of observances.filter(o => o.enabled !== false)) {
    for (const year of [currentYear, currentYear + 1]) {
      const gDate = hijriToGregorian(item.day, item.month, year, overrides);
      if (gDate && gDate >= today) candidates.push({ ...item, hYear: year, gDate });
    }
  }

  candidates.sort((a, b) => a.gDate.localeCompare(b.gDate) || Number(a.priority || 50) - Number(b.priority || 50));
  return candidates[0] || null;
}

function Field({ label, children, active = true }) {
  return (
    <label className={`hijri-field ${active ? '' : 'readonly'}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

export default function HijriCalendar() {
  const todayIso = toIsoDate(new Date());
  const [settings, setSettings] = useState({ overrides: [] });
  const [observances, setObservances] = useState(DEFAULT_HIJRI_OBSERVANCES);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [convertMode, setConvertMode] = useState('gregorian');
  const [gInput, setGInput] = useState(todayIso);
  const [hDay, setHDay] = useState(1);
  const [hMonth, setHMonth] = useState(1);
  const [hYear, setHYear] = useState(1448);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const [nextSettings, nextObservances] = await Promise.all([
        getHijriSettings(),
        getHijriObservances(),
      ]);
      if (cancelled) return;

      const overrides = nextSettings.overrides || [];
      const currentHijri = getHijriParts(todayIso, overrides);
      setSettings(nextSettings);
      setObservances(sortHijriObservances(nextObservances));
      setHDay(currentHijri?.day || 1);
      setHMonth(currentHijri?.month || 1);
      setHYear(currentHijri?.year || 1448);
      setLoading(false);
    }
    load().catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [todayIso]);

  const overrides = settings.overrides || [];
  const todayHijri = getHijriDisplay(todayIso, overrides);
  const nextObservance = useMemo(() => getNextObservance(observances, overrides), [observances, overrides]);
  const gToHijri = getHijriDisplay(gInput, overrides);
  const hToGregorian = hijriToGregorian(Number(hDay), Number(hMonth), Number(hYear), overrides);
  const currentHijriYear = getCurrentHijriYear(overrides) || Number(hYear) || 1448;

  const visibleObservances = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sortHijriObservances(observances)
      .filter(item => item.enabled !== false)
      .filter(item => category === 'All' || item.category === category)
      .filter(item => !q || `${item.name} ${item.notes} ${item.category}`.toLowerCase().includes(q));
  }, [observances, search, category]);

  const useGregorianInput = convertMode === 'gregorian';

  return (
    <main className="hijri-page">
      <header className="hijri-page-title">
        <h1>Hijri Calendar</h1>
      </header>

      {loading ? (
        <div className="card hijri-loading">Loading Hijri calendar...</div>
      ) : (
        <>
          <section className="card hijri-today-card">
            <div>
              <h2>Today</h2>
              <div className="hijri-today-date">
                <strong>{formatDate(todayIso, { weekday: 'long' })}</strong>
                <span>{todayHijri}</span>
              </div>
              {nextObservance && (
                <div className={`hijri-next-inline ${observanceTone(nextObservance.category)}`}>
                  <small>Next Observance</small>
                  <b>{nextObservance.name}</b>
                  <span>
                    {hijriDisplayFromParts(nextObservance.day, nextObservance.month, nextObservance.hYear)}
                    {' - '}
                    {formatDate(nextObservance.gDate, { weekday: 'long' })}
                  </span>
                </div>
              )}
            </div>
          </section>

          <section className="card hijri-convert-card">
            <div className="hijri-section-heading">
              <div className="hijri-swap-icon" aria-hidden="true">⇄</div>
              <h2>Quick Convert</h2>
            </div>
            <div className="hijri-convert-toggle">
              <button
                type="button"
                className={useGregorianInput ? 'active' : ''}
                onClick={() => setConvertMode('gregorian')}
              >
                Gregorian to Hijri
              </button>
              <button
                type="button"
                className={!useGregorianInput ? 'active' : ''}
                onClick={() => setConvertMode('hijri')}
              >
                Hijri to Gregorian
              </button>
            </div>
            <div className="hijri-convert-panel active">
              {useGregorianInput ? (
                <Field label="Gregorian date" active={useGregorianInput}>
                  <input
                    type="date"
                    value={gInput}
                    onChange={e => setGInput(e.target.value)}
                  />
                </Field>
              ) : (
                <div className="hijri-form-row three">
                  <Field label="Day">
                    <input type="number" min="1" max="30" value={hDay} onChange={e => setHDay(e.target.value)} />
                  </Field>
                  <Field label="Month">
                    <select value={hMonth} onChange={e => setHMonth(e.target.value)}>
                      {HIJRI_MONTHS.map(m => <option key={m.value} value={m.value}>{m.name}</option>)}
                    </select>
                  </Field>
                  <Field label="Year">
                    <input type="number" value={hYear} onChange={e => setHYear(e.target.value)} />
                  </Field>
                </div>
              )}
              <div className="hijri-result-panel">
                <small>{useGregorianInput ? 'Hijri date' : 'Gregorian date'}</small>
                <strong>
                  {useGregorianInput
                    ? (gToHijri || 'Select a Gregorian date')
                    : (hToGregorian ? formatDate(hToGregorian, { weekday: 'long' }) : 'Select a Hijri date')}
                </strong>
              </div>
            </div>
          </section>

          <section className="card hijri-events-card">
            <div className="hijri-events-header">
              <div>
                <h2>Important Dates</h2>
              </div>
              <span>{visibleObservances.length}</span>
            </div>

            <div className="hijri-toolbar">
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search important dates..." />
              <select value={category} onChange={e => setCategory(e.target.value)}>
                {CATEGORIES.map(item => <option key={item} value={item}>{item}</option>)}
              </select>
            </div>

            <div className="hijri-event-list">
              {visibleObservances.map(item => {
                const gDate = hijriToGregorian(item.day, item.month, currentHijriYear, overrides);
                return (
                  <article key={item.id} className={`hijri-event-row ${observanceTone(item.category)}`}>
                    <div className="hijri-date-badge">
                      <b>{item.day}</b>
                      <span>{monthName(item.month).slice(0, 3)}</span>
                    </div>
                    <div>
                      <h3>{item.name}</h3>
                      <small>{gDate ? formatDate(gDate, { weekday: 'long' }) : 'Date unavailable'} in {currentHijriYear} AH</small>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </>
      )}

      <style>{`
        .hijri-page { padding: 14px 14px 100px; max-width: 880px; margin: 0 auto; }
        .hijri-page-title { padding: 4px 4px 12px; }
        .hijri-page-title h1 { margin: 0; color: var(--text); font-size: clamp(1.9rem, 6vw, 2.55rem); line-height: 1.05; letter-spacing: 0; }
        .hijri-loading { padding: 22px; text-align: center; font-weight: 900; color: var(--muted); border-radius: 18px; }
        .hijri-today-card, .hijri-convert-card, .hijri-events-card {
          border-radius: 18px; padding: 16px; margin-bottom: 14px; border: 1px solid var(--border);
          box-shadow: var(--shadow-sm);
        }
        .hijri-today-card { display: block; }
        .hijri-icon {
          width: 50px; height: 50px; border-radius: 999px; background: var(--teal); color: white;
          display: grid; place-items: center; font-size: .7rem; font-weight: 950; text-transform: uppercase;
        }
        .hijri-icon.small { width: 42px; height: 42px; background: #e6f4f1; color: var(--teal); }
        .hijri-icon.observance { background: #e6f4f1; color: var(--teal); }
        .hijri-today-card h2, .hijri-convert-card h2, .hijri-next-card h2, .hijri-events-card h2 {
          margin: 0; color: var(--text); font-size: 1.35rem; line-height: 1.15;
        }
        .hijri-today-date { display: grid; gap: 4px; margin-top: 10px; }
        .hijri-today-date strong {
          color: var(--teal); font-size: 1.08rem; font-weight: 950; line-height: 1.25;
        }
        .hijri-today-date span {
          color: var(--text); font-size: .98rem; font-weight: 850; line-height: 1.3;
        }
        .hijri-next-inline {
          margin-top: 13px; padding: 12px 13px; border-radius: 15px; border: 1.5px solid;
          display: grid; gap: 4px;
        }
        .hijri-next-inline small { font-size: .72rem; font-weight: 950; color: var(--muted); text-transform: uppercase; }
        .hijri-next-inline b { color: var(--text); font-size: 1rem; line-height: 1.25; }
        .hijri-next-inline span { color: var(--muted); font-size: .8rem; font-weight: 800; line-height: 1.35; }
        .hijri-next-inline.happy { background: #effbea; border-color: #86efac; }
        .hijri-next-inline.sad { background: #fff1f2; border-color: #fda4af; }
        .hijri-next-inline.occasion { background: #eef8ff; border-color: #93c5fd; }
        .hijri-next-inline.happy b { color: #15803d; }
        .hijri-next-inline.sad b { color: #b91c1c; }
        .hijri-next-inline.occasion b { color: #1d4ed8; }
        .hijri-section-heading { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
        .hijri-swap-icon {
          width: 34px; height: 34px; border-radius: 12px; background: #e6f4f1; color: var(--teal);
          display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto;
          font-size: 1.18rem; font-weight: 950; line-height: 1;
        }
        .hijri-convert-toggle {
          display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 4px; border-radius: 14px;
          background: #f4f7f6; margin-bottom: 12px;
        }
        .hijri-convert-toggle button {
          border: 0; border-radius: 11px; padding: 10px 8px; background: transparent; color: var(--muted);
          font-weight: 900; cursor: pointer; box-shadow: none; font-size: .82rem;
        }
        .hijri-convert-toggle button.active { background: var(--teal); color: white; box-shadow: var(--shadow-sm); }
        .hijri-convert-panel {
          border: 1.5px solid var(--teal); border-radius: 16px; padding: 13px; background: #fbfffe;
        }
        .hijri-result-panel {
          margin-top: 8px; padding: 10px 12px; border-radius: 13px; background: #e6f4f1;
          display: grid; gap: 4px;
        }
        .hijri-result-panel small { color: var(--muted); font-size: .72rem; font-weight: 950; }
        .hijri-result-panel strong {
          color: var(--teal); font-size: .98rem; font-weight: 950; line-height: 1.35;
        }
        .hijri-field { display: grid; gap: 6px; margin-bottom: 8px; color: var(--text); }
        .hijri-field span { font-size: .74rem; font-weight: 950; }
        .hijri-field.readonly span { color: var(--muted); }
        .hijri-field input, .hijri-field select, .hijri-toolbar input, .hijri-toolbar select {
          width: 100%; border: 1.5px solid var(--teal); border-radius: 13px; padding: 10px 11px;
          background: white; color: var(--text); font: inherit; font-size: .9rem; font-weight: 850;
        }
        .hijri-field input:disabled { color: var(--text); opacity: 1; background: white; }
        .hijri-readonly-date {
          width: 100%; min-height: 40px; border: 1.5px solid var(--border); border-radius: 13px; padding: 10px 11px;
          background: white; color: var(--teal); font-size: .9rem; font-weight: 950;
        }
        .hijri-form-row { display: grid; gap: 8px; }
        .hijri-form-row.three { grid-template-columns: .65fr 1.35fr .8fr; }
        .hijri-events-card { padding: 16px 14px; }
        .hijri-events-header {
          display: flex; justify-content: space-between; gap: 12px; align-items: start; margin-bottom: 12px;
        }
        .hijri-events-header span {
          background: #e6f4f1; color: var(--teal); border-radius: 999px; padding: 7px 12px; font-weight: 950;
        }
        .hijri-toolbar { display: grid; gap: 8px; margin-bottom: 12px; }
        .hijri-event-list { display: grid; gap: 10px; }
        .hijri-event-row {
          display: grid; grid-template-columns: auto 1fr; gap: 11px; align-items: center;
          border: 1px solid var(--border); border-left: 5px solid var(--teal); border-radius: 16px; padding: 11px; background: white;
        }
        .hijri-event-row.happy { border-left-color: #22c55e; background: #fbfffb; }
        .hijri-event-row.sad { border-left-color: #dc2626; background: #fffafa; }
        .hijri-event-row.occasion { border-left-color: #2563eb; background: #fbfdff; }
        .hijri-date-badge {
          width: 56px; height: 56px; border-radius: 15px; background: #e6f4f1; color: var(--teal);
          display: grid; place-items: center; line-height: 1;
        }
        .hijri-event-row.happy .hijri-date-badge { background: #dcfce7; color: #15803d; }
        .hijri-event-row.sad .hijri-date-badge { background: #fee2e2; color: #b91c1c; }
        .hijri-event-row.occasion .hijri-date-badge { background: #dbeafe; color: #1d4ed8; }
        .hijri-date-badge b { font-size: 1.15rem; }
        .hijri-date-badge span { font-size: .66rem; font-weight: 950; text-transform: uppercase; }
        .hijri-event-row h3 { margin: 0 0 4px; font-size: .98rem; line-height: 1.22; color: var(--text); }
        .hijri-event-row p, .hijri-event-row small {
          display: block; margin: 0; color: var(--muted); font-size: .79rem; font-weight: 800; line-height: 1.35;
        }
        @media (min-width: 700px) {
          .hijri-page { padding-top: 20px; }
          .hijri-toolbar { grid-template-columns: 1fr 210px; }
        }
        @media (max-width: 430px) {
          .hijri-form-row.three { grid-template-columns: 1fr; }
        }
      `}</style>
    </main>
  );
}
