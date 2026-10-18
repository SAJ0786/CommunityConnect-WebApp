import test from 'node:test';
import assert from 'node:assert/strict';
import { validateWebEnvironment } from '../tools/validate-web-env.mjs';

const complete = {
  VITE_FIREBASE_API_KEY: 'AIza' + 'x'.repeat(35),
  VITE_FIREBASE_AUTH_DOMAIN: 'example.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'example', VITE_FIREBASE_STORAGE_BUCKET: 'example.appspot.com',
  VITE_FIREBASE_MESSAGING_SENDER_ID: '123', VITE_FIREBASE_APP_ID: '1:123:web:example',
  VITE_FIREBASE_VAPID_KEY: 'public-push-key', VITE_GOOGLE_PLACES_KEY: 'public-maps-key',
};
test('release fails when only notification feature flags are supplied', () => {
  assert.throws(() => validateWebEnvironment({ VITE_EVENT_REMINDERS_ENABLED: 'true' }), /missing:.*VITE_FIREBASE_API_KEY/);
});
test('release rejects a placeholder Firebase API key without exposing it', () => {
  assert.throws(() => validateWebEnvironment({ ...complete, VITE_FIREBASE_API_KEY: 'placeholder' }), /API key is invalid/);
});
test('complete web configuration passes the build guard', () => {
  assert.doesNotThrow(() => validateWebEnvironment(complete));
});
