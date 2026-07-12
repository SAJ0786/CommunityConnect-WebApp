// Community Events — Service Worker
const CACHE_VERSION = 'ce-v__BUILD_TIME__';
const STATIC_CACHE  = CACHE_VERSION + '-static';
const RUNTIME_CACHE = CACHE_VERSION + '-runtime';

const PRECACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// ── Install: cache the complete shell before automatic activation ────────────
// The client activates this worker silently once no stream or form is active.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => cache.addAll(PRECACHE).catch(() => {}))
  );
  // Activate the newest worker immediately so returning PWAs do not step
  // through older deployed versions one by one.
  self.skipWaiting();
});

// ── Activate: delete old caches ──────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== STATIC_CACHE && key !== RUNTIME_CACHE)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: network-first for HTML, cache-first for assets ────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  // Always prefer fresh HTML so it references assets from the current release.
  // The cached shell remains available as an offline fallback.
  if (event.request.headers.get('accept')?.includes('text/html') ||
      url.pathname === '/' || url.pathname === '/index.html') {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(event.request, { cache: 'no-store' });
          if (response.ok) {
            const cache = await caches.open(STATIC_CACHE);
            await cache.put(event.request, response.clone());
            await cache.put('/index.html', response.clone());
          }
          return response;
        } catch {
          return await caches.match(event.request)
            || await caches.match('/index.html')
            || Response.error();
        }
      })()
    );
    return;
  }

  // Cache-first for JS/CSS/images (they're fingerprinted by Vite)
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(RUNTIME_CACHE).then(cache => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});

// ── Message: client determined that automatic activation is safe ─────────────
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
