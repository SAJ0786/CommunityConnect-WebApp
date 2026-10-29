// Refresh only while Home is mounted, online and visible. No reloads or filter resets.
export const HOME_REFRESH_MS = 60000;
export function startHomeRefresh(refresh, { page = globalThis.document, browser = globalThis.window, network = globalThis.navigator } = {}) {
  let stopped = false, pending = false;
  const run = async (reason) => {
    if (stopped || pending || page.hidden || network?.onLine === false) return;
    pending = true;
    try { await refresh(reason); } catch (error) { console.warn('Home refresh failed:', error); }
    finally { pending = false; }
  };
  void run('enter');
  const timer = browser.setInterval(run, HOME_REFRESH_MS);
  page.addEventListener('visibilitychange', run);
  browser.addEventListener('online', run);
  browser.addEventListener('focus', run);
  return () => {
    stopped = true; browser.clearInterval(timer);
    page.removeEventListener('visibilitychange', run);
    browser.removeEventListener('online', run);
    browser.removeEventListener('focus', run);
  };
}
