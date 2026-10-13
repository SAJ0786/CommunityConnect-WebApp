// Community Events — Service Worker
const CACHE_VERSION = 'ce-v__BUILD_TIME__';
const STATIC_CACHE  = CACHE_VERSION + '-static';
const RUNTIME_CACHE = CACHE_VERSION + '-runtime';
// Filled by the production build before the worker is published.
const BUILD_ASSETS = /* __BUILD_ASSETS__ */ [];

const PRECACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/offline.html',
  '/static-pages.css',
  '/theme-tokens.css',
  ...BUILD_ASSETS,
];

// ── Install: cache the complete shell before automatic activation ────────────
// The client activates this worker silently once no stream or form is active.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => cache.addAll(PRECACHE))
  );
  // The page decides when to activate this worker, so users see only one
  // controlled update/reload cycle instead of repeated splash flashes.
});

// ── Activate: delete old caches ──────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(async keys => {
      // Keep the last complete shell for tabs that are deferring their reload.
      const previous = keys.filter(key => /^ce-v\d+-static$/.test(key) && key !== STATIC_CACHE)
        .sort((a,b) => Number(b.match(/\d+/)[0]) - Number(a.match(/\d+/)[0]));
      let retained;
      for (const name of previous) {
        if (await (await caches.open(name)).match('/index.html')) { retained = name; break; }
      }
      const keep = [STATIC_CACHE, RUNTIME_CACHE, retained, retained?.replace(/-static$/, '-runtime')];
      await Promise.all(keys.filter(key => /^ce-v.*-(static|runtime)$/.test(key) && !keep.includes(key)).map(key => caches.delete(key)));
    }).then(() => self.clients.claim())
  );
});

// ── Fetch: network-first for HTML, cache-first for assets ────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  // Server-backed and action links must never be replayed from an offline cache.
  if (['/cal', '/unsubscribe.html', '/report-ai-content.html', '/sw.js', '/firebase-messaging-sw.js'].includes(url.pathname)
      || url.pathname.startsWith('/__/') || url.pathname.startsWith('/api/')) return;
  const appRoute = url.pathname === '/' || url.pathname === '/index.html'
    || /^\/businesses(?:\/|$)/.test(url.pathname);

  // Always prefer fresh HTML so it references assets from the current release.
  // The cached shell remains available as an offline fallback.
  if (event.request.mode === 'navigate' || event.request.headers.get('accept')?.includes('text/html') ||
      url.pathname === '/' || url.pathname === '/index.html') {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(event.request, { cache: 'no-store' });
          if (response.ok) {
            try {
              const cache = await caches.open(STATIC_CACHE);
              await cache.put(event.request, response.clone());
              if (url.pathname === '/' || url.pathname === '/index.html') {
                await cache.put('/index.html', response.clone());
              }
            } catch {} // A full cache must not hide a successful network response.
          }
          return response;
        } catch {
          const cache = await caches.open(STATIC_CACHE);
          return await cache.match(event.request)
            || (appRoute ? await cache.match('/index.html') : null)
            || await cache.match('/offline.html') || Response.error();
        }
      })()
    );
    return;
  }

  // Only built assets and the explicit public shell files use cache-first.
  // Unknown same-origin GETs may be dynamic or personalised; leave them alone.
  if (!url.pathname.startsWith('/assets/') && !PRECACHE.includes(url.pathname)) return;
  event.respondWith(
    caches.open(STATIC_CACHE).then(cache => cache.match(event.request)).then(async cached => {
      if (cached) return cached;
      const runtime = await caches.open(RUNTIME_CACHE);
      const stored = await runtime.match(event.request);
      if (stored) return stored;
      if (url.pathname.startsWith('/assets/')) {
        for (const name of await caches.keys()) {
          if (!/^ce-v.*-(static|runtime)$/.test(name)) continue;
          const previous = await (await caches.open(name)).match(event.request);
          if (previous) return previous;
        }
      }
      return fetch(event.request).then(async response => {
        if (response.ok) {
          try { await runtime.put(event.request, response.clone()); } catch {}
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
