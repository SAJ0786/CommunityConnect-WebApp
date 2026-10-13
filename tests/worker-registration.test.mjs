import test from 'node:test';
import assert from 'node:assert/strict';
import { registerAppWorker, registerMessagingWorker, MESSAGING_WORKER_SCOPE } from '../src/services/workerRegistration.mjs';

test('push registration never replaces the root app worker in either startup order', async () => {
  for (const order of [[registerAppWorker, registerMessagingWorker], [registerMessagingWorker, registerAppWorker]]) {
    const scopes = new Map();
    const serviceWorker = { register: async (path, options) => { scopes.set(options.scope, path); return { active: {}, scope: options.scope }; } };
    for (const register of order) await register(serviceWorker);
    assert.equal(scopes.size, 2);
    assert.equal(scopes.get('/'), '/sw.js');
    assert.equal(scopes.get(MESSAGING_WORKER_SCOPE), '/firebase-messaging-sw.js');
  }
});
test('first push setup waits for its own worker to activate', async () => {
  const registration = new EventTarget(), worker = new EventTarget();
  worker.state = 'installing'; registration.installing = worker;
  let settled = false;
  const pending = registerMessagingWorker({ register: async () => registration }).then(result => { settled = true; return result; });
  await Promise.resolve(); await Promise.resolve();
  assert.equal(settled, false);
  worker.state = 'activated'; worker.dispatchEvent(new Event('statechange'));
  assert.equal(await pending, registration);
});
test('worker startup failure and timeout reject instead of hanging sign-in', async () => {
  const registration = new EventTarget(), worker = new EventTarget();
  worker.state = 'redundant'; registration.installing = worker;
  await assert.rejects(registerMessagingWorker({ register: async () => registration }), /could not start/);
  await assert.rejects(registerMessagingWorker({ register: async () => new EventTarget() }, 10), /timed out/);
});
