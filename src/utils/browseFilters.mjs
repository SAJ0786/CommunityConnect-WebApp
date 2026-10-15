const dateString = date => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');

// Same calendar boundaries as the native eventBrowseOptions presets.
export function matchesEventPeriod(event, period, now = new Date()) {
  if (!period) return true;
  const start = new Date(now);
  start.setHours(12, 0, 0, 0);
  if (period === 'tomorrow') start.setDate(start.getDate() + 1);
  const end = new Date(start);
  if (period === 'week') end.setDate(end.getDate() + (7 - end.getDay()) % 7);
  if (period === 'month') end.setMonth(end.getMonth() + 1, 0);
  return Boolean(event.eventDate && event.eventDate >= dateString(start) && event.eventDate <= dateString(end));
}

export function coordinates(value) {
  const lat = value?.latitude, lng = value?.longitude;
  if (lat == null || lng == null || lat === '' || lng === '') return null;
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng)) || Math.abs(Number(lat)) > 90 || Math.abs(Number(lng)) > 180) return null;
  return { latitude: Number(lat), longitude: Number(lng) };
}
export function distanceKm(from, to) {
  const a = coordinates(from), b = coordinates(to);
  if (!a || !b) return Infinity;
  const rad = n => n * Math.PI / 180;
  const d = Math.sin(rad(b.latitude - a.latitude) / 2) ** 2
    + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(rad(b.longitude - a.longitude) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, d)));
}

import { getCityDefinition } from './cities.js';
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
// Work only with the existing public projection; never infer a location for suburb-only records.
export function businessOpenNow(business, now = new Date()) {
  const zone = getCityDefinition(business.city)?.timeZone;
  if (!zone) return null;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-AU', { timeZone: zone,
    weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now).map(p => [p.type, p.value]));
  const index = DAYS.indexOf(parts.weekday);
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  const hours = business.hours || [];
  const ranges = text => [...String(text || '').matchAll(/(\d{2}):(\d{2})–(\d{2}):(\d{2})/g)]
    .map(([, h, m, eh, em]) => [Number(h) * 60 + Number(m), Number(eh) * 60 + Number(em)]);
  const previous = ranges(hours[(index + 6) % 7]);
  if (previous.some(([start, end]) => end < start && minutes < end)) return true;
  if (hours[index] === 'Open 24 hours') return true;
  if (hours[index] === 'Closed') return false;
  const today = ranges(hours[index]);
  if (!today.length) return null;
  return today.some(([start, end]) => end < start ? minutes >= start : minutes >= start && minutes < end);
}
