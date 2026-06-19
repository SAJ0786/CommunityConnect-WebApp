// ─── Date utilities ────────────────────────────────────────────────────────
// NEVER use new Date().toISOString().slice(0,10) for display/filter purposes
// — toISOString() returns UTC, which is yesterday's date in Sydney until ~10am.
// Always use localDateStr() which returns the correct local date.

/**
 * Returns today's date as YYYY-MM-DD in the device's local timezone.
 * @param {number} offsetDays - days to add (positive) or subtract (negative)
 */
export function localDateStr(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dy = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dy}`;
}

/**
 * Returns today as YYYY-MM-DD in local timezone (alias for clarity).
 */
export function todayLocal() {
  return localDateStr(0);
}
