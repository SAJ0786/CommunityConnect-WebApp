export const DEFAULT_CITY = 'sydney';

export const CITY_OPTIONS = [
  { value: 'sydney', label: 'Sydney, Australia' },
  { value: 'melbourne', label: 'Melbourne, Australia' },
  { value: 'canberra', label: 'Canberra, Australia' },
  { value: 'brisbane', label: 'Brisbane, Australia' },
  { value: 'adelaide', label: 'Adelaide, Australia' },
  { value: 'hobart', label: 'Hobart, Australia' },
  { value: 'perth', label: 'Perth, Australia' },
  { value: 'rest-of-australia', label: 'Rest of Australia' },
];

const VALID_CITIES = new Set(CITY_OPTIONS.map(city => city.value));

export function normalizeCity(value) {
  return VALID_CITIES.has(value) ? value : DEFAULT_CITY;
}

function inRanges(postcode, ranges) {
  return ranges.some(([start, end]) => postcode >= start && postcode <= end);
}

export function classifyMetroArea(address = {}) {
  const postcode = Number.parseInt(String(address?.postcode || '').replace(/\D/g, ''), 10);
  if (!Number.isFinite(postcode)) return 'rest-of-australia';

  if (inRanges(postcode, [[2000, 2234], [2555, 2574], [2740, 2786]])) return 'sydney';
  if (inRanges(postcode, [[3000, 3207], [3335, 3341], [3427, 3430], [3750, 3810], [3910, 3978]])) return 'melbourne';
  if (inRanges(postcode, [[2600, 2620], [2900, 2920]])) return 'canberra';
  if (inRanges(postcode, [[4000, 4207], [4300, 4305], [4500, 4520]])) return 'brisbane';
  if (inRanges(postcode, [[5000, 5199], [5950, 5950]])) return 'adelaide';
  if (inRanges(postcode, [[7000, 7055]])) return 'hobart';
  if (inRanges(postcode, [[6000, 6214]])) return 'perth';
  return 'rest-of-australia';
}

export function getEventMetroArea(event = {}) {
  return VALID_CITIES.has(event.metroArea) ? event.metroArea : classifyMetroArea(event.address || event);
}

export function cityLabel(value) {
  return CITY_OPTIONS.find(city => city.value === value)?.label || CITY_OPTIONS[0].label;
}
