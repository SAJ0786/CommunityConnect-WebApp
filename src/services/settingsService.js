import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase/firebase';

const SETTINGS_DOC = 'hijriCalendar';

function monthIndex(year, month) {
  return Number(year) * 12 + (Number(month) - 1);
}

function gregorianToJdn(dateString) {
  const [year, month, day] = String(dateString || '').split('-').map(Number);
  if (!year || !month || !day) return null;
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return day + Math.floor((153 * m + 2) / 5) + 365 * y
    + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
}

function isPlausibleRelativeOverride(existing, hYear, hMonth, gDate) {
  if (!existing?.gDate) return false;
  const existingIdx = monthIndex(existing.hYear, existing.hMonth);
  const targetIdx = monthIndex(hYear, hMonth);
  if (existingIdx === targetIdx) return false;

  const existingJdn = gregorianToJdn(existing.gDate);
  const targetJdn = gregorianToJdn(gDate);
  if (!existingJdn || !targetJdn) return false;

  const monthDiff = existingIdx - targetIdx;
  const minDays = Math.abs(monthDiff) * 29;
  const maxDays = Math.abs(monthDiff) * 30;
  const dayDiff = monthDiff > 0 ? existingJdn - targetJdn : targetJdn - existingJdn;
  return dayDiff >= minDays && dayDiff <= maxDays;
}

/**
 * Settings schema:
 *   overrides: [{ hYear, hMonth, gDate }]  — per-month community observations
 *   adjustmentDays: number                  — legacy single offset (kept for backward compat)
 *   anchorDate: string                      — legacy anchor (kept for backward compat)
 *   anchorMonth: number|string              — selected Hijri month for admin form
 *   anchorYear: number|string               — selected Hijri year for admin form
 */
export async function getHijriSettings() {
  try {
    const snap = await getDoc(doc(db, 'settings', SETTINGS_DOC));
    if (!snap.exists()) return { overrides: [], adjustmentDays: 0, anchorDate: '', anchorMonth: '', anchorYear: '' };
    const data = snap.data();
    return {
      overrides:      data.overrides      || [],
      adjustmentDays: data.adjustmentDays ?? 0,
      anchorDate:     data.anchorDate     ?? '',
      anchorMonth:    data.anchorMonth    ?? '',
      anchorYear:     data.anchorYear     ?? '',
    };
  } catch {
    return { overrides: [], adjustmentDays: 0, anchorDate: '', anchorMonth: '', anchorYear: '' };
  }
}

export async function saveHijriSettings(settings) {
  await setDoc(doc(db, 'settings', SETTINGS_DOC), settings, { merge: true });
}

/** Save a single month override (upsert) */
export async function saveMonthOverride(hYear, hMonth, gDate) {
  const current = await getHijriSettings();
  const overrides = [
    ...(current.overrides || [])
      // Replace the exact month being edited
      .filter(o => !(Number(o.hYear) === Number(hYear) && Number(o.hMonth) === Number(hMonth)))
      // Guard against contradictory anchors around the saved month. A later
      // Hijri month cannot start only a few days after this month; stale
      // future corrections caused Safar dates to display as Rabi al-Awwal.
      .filter(o => isPlausibleRelativeOverride(o, hYear, hMonth, gDate)),
    { hYear: Number(hYear), hMonth: Number(hMonth), gDate }
  ];
  await saveHijriSettings({ ...current, overrides });
  return overrides;
}

/** Remove a month override */
export async function removeMonthOverride(hYear, hMonth) {
  const current = await getHijriSettings();
  const overrides = (current.overrides || []).filter(
    o => !(o.hYear === hYear && o.hMonth === hMonth)
  );
  await saveHijriSettings({ ...current, overrides });
  return overrides;
}
