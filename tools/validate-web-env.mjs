// Fail before emitting a deployable bundle rather than shipping a broken boot.
export function validateWebEnvironment(env) {
  const required = ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_AUTH_DOMAIN',
    'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_STORAGE_BUCKET',
    'VITE_FIREBASE_MESSAGING_SENDER_ID', 'VITE_FIREBASE_APP_ID',
    'VITE_FIREBASE_VAPID_KEY', 'VITE_GOOGLE_PLACES_KEY'];
  const missing = required.filter(key => !String(env[key] || '').trim());
  if (missing.length) throw new Error('Web release configuration missing: ' + missing.join(', '));
  if (!/^AIza[A-Za-z0-9_-]{35}$/.test(env.VITE_FIREBASE_API_KEY)) {
    throw new Error('Web release Firebase API key is invalid.');
  }
}
