// Service Worker registration + update management

export async function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
    let pendingWorker = reg.waiting || null;
    let refreshing = false;
    let hasControlledPage = Boolean(navigator.serviceWorker.controller);

    const canActivate = () => {
      try {
        if (typeof window.__communityCanAutoUpdate === 'function') {
          return window.__communityCanAutoUpdate();
        }
      } catch {}
      return true;
    };

    const activateWhenSafe = () => {
      if (!pendingWorker || !canActivate()) return;
      pendingWorker.postMessage({ type: 'SKIP_WAITING' });
      pendingWorker = null;
    };

    activateWhenSafe();

    // Watch for new SW being installed
    reg.addEventListener('updatefound', () => {
      const newWorker = reg.installing;
      if (!newWorker) return;
      newWorker.addEventListener('statechange', () => {
        // Install silently, then activate as soon as the app is not streaming
        // or editing data. First installs activate normally without a controller.
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          pendingWorker = newWorker;
          activateWhenSafe();
        }
      });
    });

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hasControlledPage) {
        hasControlledPage = true;
        return;
      }
      if (!refreshing) {
        refreshing = true;
        // Request a fresh app shell. The cache-busting query prevents an old
        // HTML document from referencing asset files removed by this update.
        window.location.replace(`/?app-update=${Date.now()}`);
      }
    });

    // Check on launch, every 15 minutes, when returning to the app, and when
    // connectivity is restored. A short poll activates any safely deferred update.
    reg.update().catch(() => {});
    const updateTimer = window.setInterval(() => reg.update().catch(() => {}), 15 * 60 * 1000);
    const activationTimer = window.setInterval(activateWhenSafe, 30 * 1000);
    const checkOnResume = () => {
      if (document.visibilityState === 'visible') {
        reg.update().catch(() => {});
        activateWhenSafe();
      }
    };
    document.addEventListener('visibilitychange', checkOnResume);
    window.addEventListener('online', checkOnResume);

    window.addEventListener('pagehide', () => {
      window.clearInterval(updateTimer);
      window.clearInterval(activationTimer);
      document.removeEventListener('visibilitychange', checkOnResume);
      window.removeEventListener('online', checkOnResume);
    }, { once: true });

  } catch (e) {
    console.warn('SW registration failed:', e.message);
  }
}
