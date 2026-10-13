import { coordinates, distanceKm } from './browseFilters.mjs';

export function publicBusinessCoordinates(location = {}) {
  if (['latitude','longitude'].some(key => !['number','string'].includes(typeof location[key]) || String(location[key]).trim() === '')) return null;
  const point = coordinates(location);
  if (!point) return null;
  if (location.publicDisplay === 'full') return point;
  // Match the native public projection; never expose exact suburb-only coordinates.
  return Object.fromEntries(Object.entries(point).map(([key,value]) => [key, Math.round(value * 100) / 100]));
}

export function timestampMillis(value) {
  if (value == null || value === '') return null;
  let result;
  try {
    if (typeof value.toMillis === 'function') result = value.toMillis();
    else if (typeof value.toDate === 'function') result = value.toDate().getTime();
    else if (value instanceof Date) result = value.getTime();
    else if (typeof value === 'object' && typeof value.seconds === 'number') result = value.seconds * 1000;
    else if (typeof value === 'number') result = value;
    else if (typeof value === 'string') result = Date.parse(value);
  } catch { return null; }
  return Number.isFinite(result) && result > 0 ? result : null;
}

export function businessDiscovery(rows, { filter, location, now = Date.now() }) {
  if (filter === 'near') return rows.map(row => ({ ...row, distanceKm:distanceKm(location,row.coordinates) }))
    .filter(row => Number.isFinite(row.distanceKm))
    .sort((a,b) => a.distanceKm - b.distanceKm || a.name.localeCompare(b.name));
  if (filter === 'recent') return rows.filter(row => Number.isFinite(row.publishedAtMillis)
    && row.publishedAtMillis >= now - 30 * 86400000 && row.publishedAtMillis <= now)
    .slice().sort((a,b) => b.publishedAtMillis - a.publishedAtMillis || a.name.localeCompare(b.name));
  return rows;
}

export function requestBusinessLocation() {
  return new Promise((resolve,reject) => {
    if (!globalThis.navigator?.geolocation) { reject(new Error('Location is unavailable in this browser.')); return; }
    navigator.geolocation.getCurrentPosition(position => {
      const point = coordinates(position.coords);
      if (point) resolve(point); else reject(new Error('Your location could not be determined.'));
    }, () => reject(new Error('Location could not be accessed. Allow location access in your browser to use Near me.')),
    { timeout:10000, maximumAge:300000, enableHighAccuracy:false });
  });
}
