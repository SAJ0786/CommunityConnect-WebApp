import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase/firebase';

const SETTINGS_DOC = 'hijriCalendar';

/**
 * Settings schema:
 *   overrides: [{ hYear, hMonth, gDate }]  — per-month community observations
 *   adjustmentDays: number                  — legacy single offset (kept for backward compat)
 *   anchorDate: string                      — legacy anchor (kept for backward compat)
 */
export async function getHijriSettings() {
  try {
    const snap = await getDoc(doc(db, 'settings', SETTINGS_DOC));
    if (!snap.exists()) return { overrides: [], adjustmentDays: 0 };
    const data = snap.data();
    return {
      overrides:      data.overrides      || [],
      adjustmentDays: data.adjustmentDays || 0,
      anchorDate:     data.anchorDate     || '',
    };
  } catch {
    return { overrides: [], adjustmentDays: 0 };
  }
}

export async function saveHijriSettings(settings) {
  await setDoc(doc(db, 'settings', SETTINGS_DOC), settings, { merge: true });
}

/** Save a single month override (upsert) */
export async function saveMonthOverride(hYear, hMonth, gDate) {
  const current = await getHijriSettings();
  const overrides = [
    ...(current.overrides || []).filter(o => !(o.hYear === hYear && o.hMonth === hMonth)),
    { hYear, hMonth, gDate }
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
