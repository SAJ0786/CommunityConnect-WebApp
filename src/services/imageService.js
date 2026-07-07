// ─── Event Image Service ──────────────────────────────────────────────────────
// Handles host photo uploads (compressed) to Firebase Storage, and provides
// organiser-logo fallbacks — first from Firestore-managed organisations,
// then from the bundled static logos for the original three orgs.

import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from '../firebase/firebase';
import { getOrganisations } from './organisationsService';

// Bundled fallback logos (always available, no network required)
import fallbackCommunity  from '../assets/fallback_community.png';
import fallbackMuhammadi  from '../assets/fallback_muhammadi.png';
import fallbackImamHasan  from '../assets/fallback_imamhasan.png';
import fallbackAlamdar    from '../assets/fallback_alamdar.png';

// ── Bundled org map (slug → imported asset) ─────────────────────────────────
const BUNDLED = {
  muhammadi: fallbackMuhammadi,
  imamhasan: fallbackImamHasan,
  alamdar:   fallbackAlamdar,
};

// ── Cached Firestore orgs (refreshed once per session) ──────────────────────
let _orgsCache = null;
let _orgsCacheTime = 0;
let _orgsPromise = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function loadOrgs() {
  const now = Date.now();
  if (_orgsCache && now - _orgsCacheTime < CACHE_TTL) return _orgsCache;
  if (_orgsPromise) return _orgsPromise;
  _orgsPromise = getOrganisations()
    .then(orgs => {
      _orgsCache = orgs;
      _orgsCacheTime = Date.now();
      return _orgsCache;
    })
    .catch(() => _orgsCache || [])
    .finally(() => { _orgsPromise = null; });
  return _orgsPromise;
}

// Invalidate cache (called after adding/deleting an org in admin)
export function invalidateOrgsCache() {
  _orgsCache = null;
  _orgsCacheTime = 0;
  _orgsPromise = null;
}

// ── Fallback image resolution ─────────────────────────────────────────────────
// Returns a URL/data-URI for the organisation logo, or the Community Events logo.
// Checks Firestore organisations first (dynamic), then bundled assets (static).
const normaliseOrgText = value => String(value || '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()
  .replace(/\s+/g, ' ');

export async function getFallbackImageAsync(event = {}) {
  const orgType = String(event.organiserType || '').trim().toLowerCase();
  const name = normaliseOrgText(event.hostName || event.organiserName);

  // Firestore is authoritative so logos edited in Admin Dashboard appear on
  // event cards. Bundled assets are only an offline/network fallback.
  try {
    const orgs = await loadOrgs();
    const communityOrg = orgs.find(org =>
      String(org.slug || '').toLowerCase() === 'community'
      || String(org.name || '').trim().toLowerCase() === 'community events australia'
    );

    // Private events always use the Community Events Australia organisation.
    if (orgType === 'private' && communityOrg?.logoBase64) {
      return communityOrg.logoBase64;
    }

    const withLogos = orgs.filter(org => !!org.logoBase64);

    // 1. The selected organiser slug is authoritative.
    const exactSlug = withLogos.find(org =>
      String(org.slug || '').trim().toLowerCase() === orgType
    );
    if (exactSlug) return exactSlug.logoBase64;

    // 2. Prefer an exact host/organisation name.
    const exactName = withLogos.find(org => normaliseOrgText(org.name) === name);
    if (exactName && name) return exactName.logoBase64;

    // 3. For old "centre" events, choose the longest specific name match.
    // Generic words such as "centre" can no longer select an arbitrary org.
    const nameMatches = withLogos
      .map(org => {
        const orgName = normaliseOrgText(org.name);
        if (!name || orgName.length < 6) return null;
        if (name.includes(orgName)) return { org, score:orgName.length + 100 };
        if (name.length >= 8 && orgName.includes(name)) return { org, score:name.length };
        return null;
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score);
    if (nameMatches.length) return nameMatches[0].org.logoBase64;

    if (communityOrg?.logoBase64) return communityOrg.logoBase64;
  } catch { /* ignore, fall through */ }

  if (BUNDLED[orgType]) return BUNDLED[orgType];
  if (name.includes('muhammadi'))                                return fallbackMuhammadi;
  if (name.includes('imam hasan') || name.includes('imamhasan')) return fallbackImamHasan;
  if (name.includes('alamdar'))                                  return fallbackAlamdar;
  return fallbackCommunity;
}

// Synchronous fallback for bundled orgs only (used in compact card before async resolves)
export function getFallbackImage(event = {}) {
  const org  = (event.organiserType || '').toLowerCase();
  const name = (event.hostName || event.organiserName || '').toLowerCase();
  if (BUNDLED[org]) return BUNDLED[org];
  if (name.includes('muhammadi'))                                return fallbackMuhammadi;
  if (name.includes('imam hasan') || name.includes('imamhasan')) return fallbackImamHasan;
  if (name.includes('alamdar'))                                  return fallbackAlamdar;
  return fallbackCommunity;
}

// Returns the best image for an event synchronously
export function getEventImage(event = {}, isGuest = false) {
  if (!isGuest && event.imageUrl && typeof event.imageUrl === 'string' && event.imageUrl.startsWith('http')) {
    return { src: event.imageUrl, isLogo: false };
  }
  return { src: getFallbackImage(event), isLogo: true };
}

// ── Compression & Upload ─────────────────────────────────────────────────────
export async function compressImage(file, maxDim = 1600, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width >= height) { height = Math.round(height * maxDim / width); width = maxDim; }
          else                  { width = Math.round(width * maxDim / height); height = maxDim; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          blob => blob ? resolve(blob) : reject(new Error('Compression failed')),
          'image/jpeg', quality
        );
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function uploadEventImage(file, eventId, userId) {
  const blob = await compressImage(file);
  const path = `event-images/${userId || 'anon'}/${eventId || Date.now()}.jpg`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, blob, { contentType: 'image/jpeg' });
  const url = await getDownloadURL(storageRef);
  return { url, path };
}

export async function deleteEventImage(path) {
  if (!path) return;
  try { await deleteObject(ref(storage, path)); } catch { /* ignore */ }
}
