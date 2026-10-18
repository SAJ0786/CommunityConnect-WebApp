const CACHE_VERSION = 2;
const CACHE_PREFIX = `community-events-v${CACHE_VERSION}`;
const PROFILE_CACHE_VERSION = 4;
const PROFILE_PREFIX = `community-profile-v${PROFILE_CACHE_VERSION}`;
const FRESH_AGE_MS = 15 * 60 * 1000;
const MAX_STALE_AGE_MS = 60 * 24 * 60 * 60 * 1000;

const storageFor = () => {
  try { return window.localStorage; }
  catch { return null; }
};

const cacheKey = (isGuest, uid) => `${CACHE_PREFIX}:${isGuest ? 'guest' : `user:${uid || 'unknown'}`}`;

export function readEventCache(isGuest, uid) {
  const storage = storageFor();
  if (!storage) return null;
  try {
    const key = cacheKey(isGuest, uid);
    const parsed = JSON.parse(storage.getItem(key) || 'null');
    if (!parsed || !Array.isArray(parsed.events)) return null;
    const age = Date.now() - Number(parsed.savedAt || 0);
    if (age > MAX_STALE_AGE_MS) {
      storage.removeItem(key);
      return null;
    }
    return {
      events: parsed.events,
      fresh: age < FRESH_AGE_MS,
      savedAt: Number(parsed.savedAt || 0),
    };
  } catch {
    return null;
  }
}

export function writeEventCache(isGuest, uid, events) {
  const storage = storageFor();
  if (!storage || !Array.isArray(events)) return;
  try {
    storage.setItem(cacheKey(isGuest, uid), JSON.stringify({ savedAt: Date.now(), events }));
  } catch {
    // Storage may be unavailable or full; network loading remains authoritative.
  }
}

export function readProfileCache(uid) {
  const storage = storageFor();
  if (!storage || !uid) return null;
  try {
    const key = `${PROFILE_PREFIX}:${uid}`;
    const parsed = JSON.parse(storage.getItem(key) || 'null');
    if (!parsed?.profile) return null;
    if (Date.now() - Number(parsed.savedAt || 0) > MAX_STALE_AGE_MS) {
      storage.removeItem(key);
      return null;
    }
    return parsed.profile;
  } catch {
    return null;
  }
}

export function writeProfileCache(uid, profile) {
  const storage = storageFor();
  if (!storage || !uid || !profile) return;
  if (profile.isProfileFallback) return;
  const cachedProfile = {
    ...Object.fromEntries(['adminCity', 'defaultCity', 'defaultModule', 'emailNotificationsEnabled', 'pushNotificationsEnabled', 'eventNotificationsEnabled', 'businessNotificationsEnabled', 'prayerRemindersEnabled'].filter(key => profile[key] !== undefined).map(key => [key, profile[key]])),
    fullName: profile.fullName || '',
    email: profile.email || '',
    phone: profile.phone || profile.phoneNumber || '',
    role: profile.role || 'user',
    isActive: profile.isActive !== false,
    active: profile.active !== false, accountStatus: profile.accountStatus || 'active',
    archivedAt: profile.archivedAt || null, bannedAt: profile.bannedAt || null,
    reminderEmailEnabled: profile.reminderEmailEnabled !== false,
    adminAlertEmailEnabled: profile.adminAlertEmailEnabled !== false,
    walkthroughCompleted: profile.walkthroughCompleted !== false,
  };
  try {
    storage.setItem(`${PROFILE_PREFIX}:${uid}`, JSON.stringify({
      savedAt: Date.now(),
      profile: cachedProfile,
    }));
  } catch {}
}

export function clearPrivateEventCaches() {
  for (const storage of [window.localStorage, window.sessionStorage]) {
    try {
      for (let index = storage.length - 1; index >= 0; index -= 1) {
        const key = storage.key(index);
        if (key?.startsWith('community-events-v') && key.includes(':user:')) storage.removeItem(key);
        if (key?.startsWith('community-profile-v')) storage.removeItem(key);
      }
    } catch {
      // Storage may be unavailable in private browsing modes.
    }
  }
}
