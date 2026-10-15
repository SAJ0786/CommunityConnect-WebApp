import { DEFAULT_CITY, normalizeCity, getCityDefinition } from './cities.js';

export const CITY_PRAYER_LOCATIONS = {
  sydney: { suburb: 'Sydney', state: 'NSW', latitude: -33.8688, longitude: 151.2093, fullAddress: 'Sydney NSW, Australia' },
  melbourne: { suburb: 'Melbourne', state: 'VIC', latitude: -37.8136, longitude: 144.9631, fullAddress: 'Melbourne VIC, Australia' },
  canberra: { suburb: 'Canberra', state: 'ACT', latitude: -35.2809, longitude: 149.13, fullAddress: 'Canberra ACT, Australia' },
  brisbane: { suburb: 'Brisbane', state: 'QLD', latitude: -27.4698, longitude: 153.0251, fullAddress: 'Brisbane QLD, Australia' },
  adelaide: { suburb: 'Adelaide', state: 'SA', latitude: -34.9285, longitude: 138.6007, fullAddress: 'Adelaide SA, Australia' },
  hobart: { suburb: 'Hobart', state: 'TAS', latitude: -42.8821, longitude: 147.3272, fullAddress: 'Hobart TAS, Australia' },
  perth: { suburb: 'Perth', state: 'WA', latitude: -31.9523, longitude: 115.8613, fullAddress: 'Perth WA, Australia' },
  'rest-of-australia': { suburb: 'Sydney', state: 'NSW', latitude: -33.8688, longitude: 151.2093, fullAddress: 'Sydney NSW, Australia' },
};

export function getPrayerLocation(city) {
  const normalized = normalizeCity(city || DEFAULT_CITY);
  if (normalized === 'rest-of-australia') return CITY_PRAYER_LOCATIONS.sydney; // Explicitly labelled reference only.
  const row = getCityDefinition(normalized);
  return row ? { suburb: row.label.replace(', Australia', ''), state: row.state, latitude: row.latitude, longitude: row.longitude, timeZone: row.timeZone, fullAddress: row.label } : {};
}
