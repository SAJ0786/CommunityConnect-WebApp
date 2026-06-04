// Service Worker registration + update management

export async function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register('/sw.js');

    // If a new SW is already waiting (installed but not activated yet), show banner
    if (reg.waiting) {
      showUpdateBanner(reg.waiting);
    }

    // Watch for new SW being installed
    reg.addEventListener('updatefound', () => {
      const newWorker = reg.installing;
      if (!newWorker) return;
      newWorker.addEventListener('statechange', () => {
        // Only show banner if there's an existing controller (not first install)
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          showUpdateBanner(newWorker);
        }
      });
    });

    // After user taps Update → SW calls skipWaiting → controller changes → reload
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });

    // Check for updates in background (non-blocking)
    reg.update().catch(() => {});

  } catch (e) {
    console.warn('SW registration failed:', e.message);
  }
}

function showUpdateBanner(worker) {
  // Don't show twice
  if (document.getElementById('sw-update-banner')) return;

  const banner = document.createElement('div');
  banner.id = 'sw-update-banner';
  banner.style.cssText = `
    position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
    background: #0f766e; color: white; padding: 14px 20px;
    border-radius: 14px; font-size: 14px; font-family: -apple-system, sans-serif;
    box-shadow: 0 8px 32px rgba(0,0,0,0.35); z-index: 99999;
    display: flex; align-items: center; gap: 14px;
    max-width: 360px; width: calc(100% - 32px);
    border: 1px solid rgba(255,255,255,0.15);
  `;

  const text = document.createElement('span');
  text.textContent = '🆕 New version available';
  text.style.flex = '1';

  const btn = document.createElement('button');
  btn.textContent = 'Update';
  btn.style.cssText = `
    background: white; color: #0f766e; border: none;
    border-radius: 8px; padding: 7px 16px;
    font-weight: 700; cursor: pointer; font-size: 13px;
    flex-shrink: 0; white-space: nowrap;
  `;

  const dismiss = document.createElement('button');
  dismiss.textContent = '✕';
  dismiss.style.cssText = `
    background: transparent; color: rgba(255,255,255,0.7); border: none;
    cursor: pointer; font-size: 16px; padding: 0 4px; flex-shrink: 0;
  `;

  btn.addEventListener('click', () => {
    worker.postMessage({ type: 'SKIP_WAITING' });
    banner.remove();
  });

  dismiss.addEventListener('click', () => banner.remove());

  banner.appendChild(text);
  banner.appendChild(btn);
  banner.appendChild(dismiss);
  document.body.appendChild(banner);

  // Auto-dismiss after 60 seconds if ignored
  setTimeout(() => { if (banner.parentNode) banner.remove(); }, 60000);
}
