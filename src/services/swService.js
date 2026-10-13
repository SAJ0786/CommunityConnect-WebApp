// Service Worker registration + update management
import { registerAppWorker } from './workerRegistration.mjs';

export async function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await registerAppWorker(navigator.serviceWorker);
    let pendingWorker = reg.waiting || null;
    let refreshing = false;
    let reloadPending = false;
    let hasControlledPage = Boolean(navigator.serviceWorker.controller);
    const UPDATE_RELOAD_KEY = 'community-events-sw-update-reload-at';
    const UPDATE_RELOAD_WINDOW_MS = 2 * 60 * 1000;

    const updateReloadRecentlyStarted = () => {
      try {
        const startedAt = Number(sessionStorage.getItem(UPDATE_RELOAD_KEY) || 0);
        return startedAt && Date.now() - startedAt < UPDATE_RELOAD_WINDOW_MS;
      } catch { return false; }
    };

    const markUpdateReloadStarted = () => {
      try { sessionStorage.setItem(UPDATE_RELOAD_KEY, String(Date.now())); } catch {}
    };

    const canActivate = () => {
      try {
        if (document.querySelector?.('[role="dialog"][aria-modal="true"]')) return false;
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return false;
        for (const guard of [window.__communityCanAutoUpdate, window.__communityDirectoryCanAutoUpdate]) {
          if (typeof guard === 'function' && !guard()) return false;
        }
      } catch { return false; }
      return true;
    };

    // Another tab can activate the waiting worker while this tab is editing.
    const reloadWhenSafe = () => {
      if (!reloadPending || refreshing || !canActivate()) return;
      refreshing = true;
      markUpdateReloadStarted();
      const destination = new URL(window.location.href);
      destination.searchParams.set('app-update', String(Date.now()));
      window.location.replace(destination.pathname + destination.search + destination.hash);
    };

    const activateWhenSafe = () => {
      reloadWhenSafe();
      if (!pendingWorker || !canActivate() || updateReloadRecentlyStarted()) return;
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
      reloadPending = true;
      reloadWhenSafe();
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
