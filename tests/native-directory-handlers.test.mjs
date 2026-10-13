import test from 'node:test';
import assert from 'node:assert/strict';
import { register as enquiry } from './firebase-integration/functions/native/enquiry.cjs';
import { register as support } from './firebase-integration/functions/native/support-workflow.js';
import { recordingAdmin } from './firebase-integration/recordingAdmin.mjs';
import { seedRecords } from './firebase-integration/fixtures.mjs';
class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
const auth = uid => ({ uid, token: { firebase: { sign_in_provider: 'phone' } } });
function setup() {
  const state = recordingAdmin(seedRecords());
  const dependencies = { ...state, HttpsError, REGION: 'australia-southeast1', onCall: (_, handler) => handler,
    onDocumentCreated: () => undefined, EMAIL_SECRETS: [], buildTransporter: () => { throw new Error('No email transport'); }, logger: console };
  return { ...state, enquiry: enquiry(dependencies), support: support(dependencies).submitSupportRequest };
}
test('native enquiry creates a participant thread and subsequent messages increment owner unread', async () => {
  const state = setup();
  const request = { auth: auth('review-customer'), data: { businessId: 'example', text: 'Synthetic local enquiry', senderName: 'Test customer' } };
  const first = await state.enquiry(request);
  assert.equal(first.isNew, true);
  const path = `businessMessageThreads/${first.threadId}`;
  assert.deepEqual(state.records.get(path).participantUids, ['review-customer', 'review-member']);
  const second = await state.enquiry(request);
  assert.equal(second.isNew, false); assert.equal(second.threadId, first.threadId);
  assert.equal(state.records.get(path).unreadBy['review-member'], 2);
  assert.equal([...state.records.keys()].filter(key => key.startsWith(path + '/messages/')).length, 2);
});
test('native enquiry rejects self, hidden, blocked and anonymous sends', async () => {
  const state = setup();
  const data = { businessId: 'example', text: 'Synthetic local enquiry' };
  await assert.rejects(state.enquiry({ auth: auth('review-member'), data }), { code: 'failed-precondition' });
  await assert.rejects(state.enquiry({ auth: { ...auth('review-customer'), token: { firebase: { sign_in_provider: 'anonymous' } } }, data }), { code: 'unauthenticated' });
  const { threadId } = await state.enquiry({ auth: auth('review-customer'), data });
  const path = `businessMessageThreads/${threadId}`;
  state.records.set(path, { ...state.records.get(path), blockedBy: { 'review-member': true } });
  await assert.rejects(state.enquiry({ auth: auth('review-customer'), data }), { code: 'failed-precondition' });
  state.records.set('businesses/example', { ...state.records.get('businesses/example'), hidden: true });
  await assert.rejects(state.enquiry({ auth: auth('review-customer'), data }), { code: 'failed-precondition' });
});
test('native support retries reuse a receipt and new submissions respect rate limiting', async () => {
  const state = setup();
  const request = { auth: auth('review-member'), data: { kind: 'app-feedback', category: 'Other', message: 'Synthetic support request only', requestId: 'local_support_test_001' } };
  const first = await state.support(request);
  assert.deepEqual(await state.support(request), first);
  assert.equal([...state.records.keys()].filter(key => key.startsWith('supportEmailOutbox/')).length, 1);
  assert.equal(state.records.get(`supportEmailOutbox/${first.reference}`).status, 'queued');
  await assert.rejects(state.support({ ...request, data: { ...request.data, requestId: 'local_support_test_002' } }), { code: 'resource-exhausted' });
});
test('native business reports route to matching city admins and supers, ignoring client recipients', async () => {
  const state = setup();
  state.records.set('users/review-other-admin', { fullName: 'Other admin', email: 'other@example.test', role: 'admin', adminCity: 'melbourne', isActive: true });
  const result = await state.support({ auth: auth('review-customer'), data: { kind: 'business-report', businessId: 'example', category: 'Other',
    message: 'Synthetic business report only', requestId: 'local_report_test_001', city: 'melbourne', recipients: ['injected@example.test'] } });
  const outbox = state.records.get(`supportEmailOutbox/${result.reference}`);
  assert.deepEqual(outbox.recipients.sort(), ['admin@example.test', 'super@example.test']);
  assert.equal(outbox.city, 'sydney');
  assert.ok(state.records.has(`userNotifications/business-report-${result.reference}-review-admin`));
  assert.equal(state.records.has(`userNotifications/business-report-${result.reference}-review-other-admin`), false);
});
