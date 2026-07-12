// ─── Date utilities ────────────────────────────────────────────────────────
// NEVER use new Date().toISOString().slice(0,10) for display/filter purposes
// — toISOString() returns UTC, which is yesterday's date in Sydney until ~10am.
// Always use localDateStr() which returns the correct local date.

/**
 * Returns today's date as YYYY-MM-DD in the app's event timezone.
 * @param {number} offsetDays - days to add (positive) or subtract (negative)
 */
export function localDateStr(offsetDays = 0) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const value = type => Number(parts.find(part => part.type === type)?.value);
  const date = new Date(Date.UTC(value('year'), value('month') - 1, value('day') + offsetDays));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Returns today as YYYY-MM-DD in local timezone (alias for clarity).
 */
export function todayLocal() {
  return localDateStr(0);
}

export function normaliseEventTime(value = '') {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{1,2})(?::?(\d{2}))?/);
  if (!match) return '99:99';
  const hour = Math.max(0, Math.min(23, Number(match[1]) || 0));
  const minute = Math.max(0, Math.min(59, Number(match[2]) || 0));
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function compareEventsByDateTime(a = {}, b = {}) {
  const dateCompare = String(a.eventDate || '').localeCompare(String(b.eventDate || ''));
  if (dateCompare) return dateCompare;
  const timeCompare = normaliseEventTime(a.startTime).localeCompare(normaliseEventTime(b.startTime));
  if (timeCompare) return timeCompare;
  return String(a.hostName || a.eventTypeDisplay || a.eventType || '')
    .localeCompare(String(b.hostName || b.eventTypeDisplay || b.eventType || ''));
}
