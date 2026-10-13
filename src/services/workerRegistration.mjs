export const APP_WORKER_SCOPE = '/';
// Firebase's dedicated messaging scope; it must not replace the root app worker.
export const MESSAGING_WORKER_SCOPE = '/firebase-cloud-messaging-push-scope';

export function registerAppWorker(serviceWorker) {
  return serviceWorker.register('/sw.js', { scope: APP_WORKER_SCOPE, updateViaCache: 'none' });
}

export async function registerMessagingWorker(serviceWorker, timeoutMs = 15000) {
  const registration = await serviceWorker.register('/firebase-messaging-sw.js', {
    scope: MESSAGING_WORKER_SCOPE, updateViaCache: 'none',
  });
  if (registration.active) return registration;
  // A newly created messaging registration may still be installing. PushManager
  // needs an active worker; serviceWorker.ready would wait for the root worker.
  await new Promise((resolve, reject) => {
    const workers = new Set();
    const finish = error => {
      clearTimeout(timer);
      registration.removeEventListener('updatefound', watch);
      workers.forEach(worker => worker.removeEventListener('statechange', check));
      if (error) reject(error); else resolve();
    };
    const check = () => {
      if (registration.active || [...workers].some(worker => worker.state === 'activated')) finish();
      else if (workers.size && [...workers].every(worker => worker.state === 'redundant')) finish(new Error('The notification worker could not start. Please retry.'));
    };
    const watch = () => {
      for (const worker of [registration.installing, registration.waiting]) {
        if (worker && !workers.has(worker)) { workers.add(worker); worker.addEventListener('statechange', check); }
      }
      check();
    };
    const timer = setTimeout(() => finish(new Error('Notification setup timed out. Please retry.')), timeoutMs);
    registration.addEventListener('updatefound', watch);
    watch();
  });
  return registration;
}
