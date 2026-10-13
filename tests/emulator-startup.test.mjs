import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { waitForFirestore } from './firebase-integration/emulatorRest.mjs';

test('Firestore startup retries transient failures before accepting a successful database read', async () => {
  let clock = 0, count = 0;
  await waitForFirestore({ timeoutMs: 10000, now: () => clock, delay: async ms => { clock += ms; }, probe: async remaining => {
    assert.ok(remaining > 0);
    count++;
    if (count === 1) { clock += 5000; throw new Error('Cold-start timeout'); }
    return { status: count === 2 ? 503 : 200 };
  } });
  assert.equal(count, 3);
});
test('Firestore readiness reports setup failure, bounds its wait and does not retry permission errors', async () => {
  let clock = 0;
  await assert.rejects(waitForFirestore({ timeoutMs: 1000, now: () => clock, delay: async ms => { clock += ms; }, probe: async remaining => {
    clock += remaining; throw new Error('Unavailable');
  } }), /Permission tests have not run/);
  assert.equal(clock, 1000);
  let calls = 0;
  await assert.rejects(waitForFirestore({ probe: async () => { calls++; return { status: 403 }; } }), /HTTP 403/);
  assert.equal(calls, 1);
});
test('backend bootstrap injects modular FieldValue even when the legacy namespace has no statics', async () => {
  const source = await fs.readFile(new URL('./firebase-integration/functions/index.cjs', import.meta.url), 'utf8');
  const timestamp = Symbol('server timestamp'), increment = Symbol('increment');
  const FieldValue = { serverTimestamp: () => timestamp, increment: () => increment };
  const captured = [];
  const modules = {
    './isolation.cjs': { assertLocalBackend: () => {} },
    'firebase-admin': { firestore: () => ({}) },
    'firebase-admin/app': { initializeApp: () => {} },
    'firebase-admin/firestore': { getFirestore: () => ({}), FieldValue, Timestamp: {} },
    'firebase-admin/auth': { getAuth: () => ({}) },
    'firebase-functions/v2/https': { onCall: (_, handler) => handler, HttpsError: Error },
    './review-guards.cjs': { createReviewGuard: () => async () => {} },
    './abr-fixtures.cjs': { lookupAbrFixture: async () => ({}) },
    './event-reminders.cjs': { createReminderHandlers: () => ({ get() {}, set() {}, remove() {} }) },
    './member-registration.cjs': { createMemberRegistrationHandlers: () => ({ complete() {}, recordCreated() {} }) },
    '../../../functions/web-member-operation.cjs': { createWebMemberOperation: () => () => {} },
    './directory-operations.cjs': { register: dependencies => { captured.push(dependencies); return { listDirectoryOperations() {}, decideDirectoryReport() {}, submitDirectoryConversationReport() {} }; } },
    './native/abn.cjs': { register: dependencies => { captured.push(dependencies); return { verifyBusinessAbn() {}, lookupBusinessAbnForSubmission() {} }; } },
    './native/lifecycle.cjs': { register: dependencies => { captured.push(dependencies); return { adminDeleteUser() {}, adminRestoreUser() {} }; } },
    './native/event-archive.cjs': { register: dependencies => { captured.push(dependencies); return { archiveEventRecords() {}, archiveFutureSeriesEvents() {} }; } },
    './native/enquiry.cjs': { register: dependencies => { captured.push(dependencies); return () => {}; } },
    './native/support-workflow.js': { register: dependencies => { captured.push(dependencies); return { submitSupportRequest() {} }; } },
  };
  const exported = {};
  vm.runInNewContext(source, { require: name => { assert.ok(modules[name], `Unexpected module ${name}`); return modules[name]; }, exports: exported, process: { env: {} }, console });
  assert.equal(typeof exported.sendBusinessEnquiry, 'function');
  assert.equal(typeof exported.submitSupportRequest, 'function');
  assert.equal(typeof exported.verifyBusinessAbn, 'function');
  assert.equal(typeof exported.adminRestoreUser, 'function');
  assert.equal(typeof exported.decideDirectoryReport, 'function');
  assert.equal(typeof exported.archiveEventRecords, 'function');
  assert.equal(typeof exported.archiveFutureSeriesEvents, 'function');
  assert.equal(Object.keys(exported).length, 16);
  assert.equal(captured.length, 8);
  for (const dependencies of captured) {
    assert.equal(dependencies.admin.firestore.FieldValue, FieldValue);
    assert.equal(dependencies.admin.firestore.FieldValue.serverTimestamp(), timestamp);
    assert.equal(dependencies.admin.firestore.FieldValue.increment(1), increment);
  }
});
