// Public-directory adapter. Never pass an unrestricted Firestore document to UI.
import { publicBusinessCoordinates, timestampMillis } from './businessDiscovery.mjs';
const text = value => typeof value === 'string' ? value.trim() : '';
const strings = value => Array.isArray(value) ? [...new Set(value.map(text).filter(Boolean))] : [];
import { normalizeCity } from './cities.js';

export function safeWebsite(value) {
  const raw = text(value);
  if (!raw) return '';
  try {
    // Reject explicit non-web schemes, including javascript:, data: and file:.
    const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(raw) ? raw : `https://${raw}`);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}

export function formatHours(row) {
  if (!row || typeof row !== 'object') return 'Not supplied';
  if (row.closed === true) return 'Closed';
  if (row.open24Hours === true) return 'Open 24 hours';
  const periods = Array.isArray(row.periods) ? row.periods : [row];
  const validTime = value => /^([01]\d|2[0-3]):[0-5]\d$/.test(text(value));
  return periods.filter(p => validTime(p?.open) && validTime(p?.close))
    .map(p => `${p.open}–${p.close}${p.close < p.open ? ' (next day)' : ''}`).join(', ') || 'Not supplied';
}

export function toPublicBusiness(id, data = {}) {
  if (data.status !== 'approved' || data.hidden === true || !text(data.name)) return null;
  const location = data.location || {};
  const suburbAddress = [location.suburb, location.state, location.postcode].map(text).filter(Boolean).join(' ');
  return {
    id: text(id), name: text(data.name), description: text(data.description),
    categories: strings([...(Array.isArray(data.categories) ? data.categories : []), data.category]),
    services: strings(data.subcategories),
    city: location.city ? normalizeCity(location.city) : 'rest-of-australia',
    suburb: text(location.suburb),
    coordinates: publicBusinessCoordinates(location),
    locationApproximate: location.publicDisplay !== 'full',
    publishedAtMillis: timestampMillis(data.firstPublishedAt) ?? timestampMillis(data.createdAt) ?? timestampMillis(data.approvedAt),
    // Honour suburb-only listings even if a malformed public record contains a street.
    address: location.publicDisplay === 'full' ? text(location.fullAddress) || suburbAddress : suburbAddress,
    website: safeWebsite(data.contact?.website),
    logoUrl: safeWebsite(data.logoUrl), coverUrl: safeWebsite(data.coverUrl),
    whatsapp: text(data.contact?.whatsapp).replace(/[^\d]/g, ''),
    social: { facebook: safeWebsite(data.social?.facebook), instagram: safeWebsite(data.social?.instagram), x: safeWebsite(data.social?.twitter || data.social?.x) },
    phone: text(data.contact?.phone).replace(/[^\d+]/g, ''),
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(data.contact?.email)) ? text(data.contact.email) : '',
    abnVerified: data.abnVerified === true,
    hours: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map(day => formatHours(data.hours?.[day])),
  };
}

export function filterPublicBusinesses(rows, { city, category = '', search = '' }) {
  const needle = search.trim().toLocaleLowerCase();
  return rows.filter(row => row.city === city && (!category || row.categories.includes(category)))
    .filter(row => !needle || [row.name, row.description, row.suburb, ...row.categories, ...row.services]
      .join(' ').toLocaleLowerCase().includes(needle))
    .sort((a, b) => a.name.localeCompare(b.name));
}
