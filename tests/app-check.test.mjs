import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = file => readFileSync(new URL(file, import.meta.url), 'utf8');

test('App Check key is public, validated, and defaults to unconfigured', async () => {
  const { APP_CHECK_CONFIGURED, APP_CHECK_SITE_KEY } = await import('../src/config/appCheck.mjs');
  assert.equal(APP_CHECK_CONFIGURED, false);
  assert.equal(APP_CHECK_SITE_KEY, '');
  assert.match(read('../.env.example'), /^VITE_APP_CHECK_RECAPTCHA_V3_SITE_KEY=$/m);
});

test('city management requires App Check and stays initialised only with a key', () => {
  assert.match(read('../src/config/releaseGates.mjs'), /CITY_CATALOGUE_ENABLED && APP_CHECK_CONFIGURED/);
  const firebase = read('../src/firebase/firebase.js');
  assert.match(firebase, /if \(APP_CHECK_CONFIGURED\)[\s\S]*initializeAppCheck/);
  assert.doesNotMatch(firebase, /FIREBASE_APPCHECK_DEBUG_TOKEN/);
});
