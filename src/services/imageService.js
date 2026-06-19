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
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function loadOrgs() {
  const now = Date.now();
  if (_orgsCache && now - _orgsCacheTime < CACHE_TTL) return _orgsCache;
  try {
    const orgs = await getOrganisations();
    _orgsCache = orgs;
    _orgsCacheTime = now;
  } catch { _orgsCache = _orgsCache || []; }
  return _orgsCache || [];
}

// Invalidate cache (called after adding/deleting an org in admin)
export function invalidateOrgsCache() {
  _orgsCache = null;
  _orgsCacheTime = 0;
}

// ── Fallback image resolution ─────────────────────────────────────────────────
// Returns a URL/data-URI for the organisation logo, or the Community Events logo.
// Checks Firestore organisations first (dynamic), then bundled assets (static).
export async function getFallbackImageAsync(event = {}) {
  const orgType = (event.organiserType || '').toLowerCase();
  const name    = (event.hostName || event.organiserName || '').toLowerCase();

  // 1. Check bundled orgs by slug
  if (BUNDLED[orgType]) return BUNDLED[orgType];

  // 2. Check name keywords for bundled orgs
  if (name.includes('muhammadi'))                              return fallbackMuhammadi;
  if (name.includes('imam hasan') || name.includes('imamhasan')) return fallbackImamHasan;
  if (name.includes('alamdar'))                                return fallbackAlamdar;

  // 3. Check Firestore orgs (dynamic — set by admin)
  try {
    const orgs = await loadOrgs();
    for (const org of orgs) {
      const slug  = (org.slug  || '').toLowerCase();
      const oName = (org.name  || '').toLowerCase();
      if (orgType === slug || name.includes(slug) || name.includes(oName)) {
        if (org.logoBase64) return org.logoBase64;
      }
    }
  } catch { /* ignore, fall through */ }

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
