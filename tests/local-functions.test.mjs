import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalFunctionsTransport, localIdentityToken } from '../src/services/directory/localFunctions.mjs';
import { assertLocalBackend } from './firebase-integration/functions/isolation.cjs';
const user = { uid: 'review-member' };
const ok = result => ({ ok: true, json: async () => ({ result }) });
test('Functions requests use only fixed demo endpoints and synthetic identity tokens', async () => {
  const calls = [];
  const transport = createLocalFunctionsTransport({ user, hostname: 'localhost', fetchImpl: async (...args) => { calls.push(args); return ok({ threadId: 'test-thread' }); } });
  assert.deepEqual(await transport.call('sendBusinessEnquiry', { businessId: 'example', text: 'Test only' }), { threadId: 'test-thread' });
  assert.equal(calls[0][0], 'http://127.0.0.1:5002/demo-community-connect-web/australia-southeast1/callWebMemberOperation');
  assert.equal(calls[0][1].redirect, 'error');
  assert.deepEqual(JSON.parse(calls[0][1].body), { data: { operation: 'sendBusinessEnquiry', payload: { businessId: 'example', text: 'Test only' } } });
  const token = calls[0][1].headers.Authorization.slice(7).split('.');
  assert.equal(token[2], '');
  const claims = JSON.parse(Buffer.from(token[1], 'base64url'));
  assert.equal(claims.sub, user.uid); assert.equal(claims.aud, 'demo-community-connect-web');
  await assert.rejects(transport.call('https://production.example/function', {}), /not included/);
  await assert.rejects(transport.call('deleteUserData', {}), /not included/);
  assert.equal(calls.length, 1);
  assert.throws(() => localIdentityToken({ uid: 'real-user' }));
  assert.throws(() => createLocalFunctionsTransport({ user, hostname: 'communityconnect.siza.info' }));
});
test('callable errors retain their codes and transport failures do not claim nothing was saved', async () => {
  const errors = createLocalFunctionsTransport({ user, hostname: 'localhost', fetchImpl: async () => ({ ok: false, json: async () => ({ error: { status: 'RESOURCE_EXHAUSTED', message: 'Wait 30 seconds' } }) }) });
  await assert.rejects(errors.call('submitSupportRequest', {}), { code: 'functions/resource-exhausted', message: 'Wait 30 seconds' });
  for (const fetchImpl of [async () => { throw new Error('Offline'); }, async () => { throw new DOMException('Aborted', 'AbortError'); }, async () => ({ ok: true, json: async () => ({ unexpected: true }) })]) {
    const failed = createLocalFunctionsTransport({ user, hostname: 'localhost', fetchImpl });
    await assert.rejects(failed.call('submitSupportRequest', {}), /could not be confirmed/);
  }
});
test('session close aborts pending calls and prevents new ones', async () => {
  let started;
  const ready = new Promise(resolve => { started = resolve; });
  const transport = createLocalFunctionsTransport({ user, hostname: 'localhost', fetchImpl: async (_, { signal }) => {
    started(); return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('Aborted'))));
  } });
  const request = transport.call('sendBusinessEnquiry', {});
  await ready; transport.close();
  await assert.rejects(request, /ended/);
  await assert.rejects(transport.call('sendBusinessEnquiry', {}), /ended/);
});
test('isolated backend refuses missing or production environment settings', () => {
  const valid = { GCLOUD_PROJECT: 'demo-community-connect-web', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8089', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9098' };
  assert.doesNotThrow(() => assertLocalBackend(valid));
  for (const key of Object.keys(valid)) {
    assert.throws(() => assertLocalBackend({ ...valid, [key]: '' }));
    assert.throws(() => assertLocalBackend({ ...valid, [key]: 'production' }));
  }
});
