import test from 'node:test';
import assert from 'node:assert/strict';
import { register as abn } from './firebase-integration/functions/native/abn.cjs';
import { register as lifecycle } from './firebase-integration/functions/native/lifecycle.cjs';
import { createReviewGuard } from './firebase-integration/functions/review-guards.cjs';
import { lookupAbrFixture } from './firebase-integration/functions/abr-fixtures.cjs';
import { recordingAdmin } from './firebase-integration/recordingAdmin.mjs';
import { seedRecords } from './firebase-integration/fixtures.mjs';
class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
const request = (uid, data = {}) => ({ auth: { uid, token: { firebase: { sign_in_provider: 'phone' } } }, data });
function setup(provider = lookupAbrFixture) {
  const state = recordingAdmin(seedRecords());
  let lookups = 0;
  const dependencies = { ...state, HttpsError, REGION: 'australia-southeast1', onCall: (_, handler) => handler,
    lookupAbrByAbn: async value => { lookups++; return provider(value); } };
  const handlers = { ...abn(dependencies), ...lifecycle(dependencies) };
  const guard = createReviewGuard(dependencies);
  return { ...state, handlers, get lookups() { return lookups; },
    call: async (name, uid, data) => { const input = request(uid, data); await guard(name, input); return handlers[name](input); } };
}
const business = state => state.records.set('businesses/example', { ...state.records.get('businesses/example'), abn: '51824753556', name: 'Example Community Catering' });

test('ABN prefill uses official-name contract, validates checksum and rate-limits repeated checks', async () => {
  const state = setup();
  await assert.rejects(state.call('lookupBusinessAbnForSubmission', 'review-member', { abn: '123' }), { code: 'invalid-argument' });
  assert.equal(state.lookups, 0);
  const result = await state.call('lookupBusinessAbnForSubmission', 'review-member', { abn: '51 824 753 556' });
  assert.equal(result.active, true); assert.equal(result.suggestedName, 'Example Community Catering');
  assert.deepEqual(result.officialNames, ['Example Community Catering', 'Synthetic Directory Test Entity']);
  await assert.rejects(state.call('lookupBusinessAbnForSubmission', 'review-member', { abn: '51824753556' }), { code: 'resource-exhausted' });
  assert.equal(state.lookups, 1);
});
test('ABN prefill refuses a mismatched provider result and enforces the daily limit', async () => {
  const mismatch = setup(async () => ({ Abn: '11111111111' }));
  await assert.rejects(mismatch.call('lookupBusinessAbnForSubmission', 'review-member', { abn: '51824753556' }), { code: 'failed-precondition' });
  const state = setup();
  state.records.set('abrLookupRateLimits/review-member', { dayKey: new Date().toISOString().slice(0, 10), dailyCount: 50 });
  await assert.rejects(state.call('lookupBusinessAbnForSubmission', 'review-member', { abn: '51824753556' }), { code: 'resource-exhausted' });
  assert.equal(state.lookups, 0);
});
test('ABN verification writes a private result and audit without publishing a listing', async () => {
  const state = setup(); business(state);
  state.records.delete('publicBusinesses/example');
  const result = await state.call('verifyBusinessAbn', 'review-admin', { businessId: 'example' });
  assert.equal(result.verified, true);
  assert.equal(state.records.get('businesses/example').abnVerified, true);
  assert.equal(state.records.has('publicBusinesses/example'), false);
  assert.equal([...state.records.values()].filter(row => row.action === 'business.abn_verified').length, 1);
});
test('failed ABN verification withdraws a published listing and its private contact route', async () => {
  const state = setup(async value => ({ ...(await lookupAbrFixture(value)), AbnStatus: 'Cancelled' })); business(state);
  state.records.set('businessContactRoutes/example', { ownerId: 'review-member' });
  const result = await state.call('verifyBusinessAbn', 'review-admin', { businessId: 'example' });
  assert.equal(result.status, 'inactive');
  assert.equal(state.records.get('businesses/example').status, 'pending');
  assert.equal(state.records.get('businesses/example').hidden, true);
  assert.equal(state.records.has('publicBusinesses/example'), false);
  assert.equal(state.records.has('businessContactRoutes/example'), false);
});
test('ABN name mismatch fails verification and provider errors preserve the existing record', async () => {
  const state = setup(); business(state);
  state.records.get('businesses/example').name = 'A different name';
  assert.equal((await state.call('verifyBusinessAbn', 'review-super', { businessId: 'example' })).status, 'name_review_required');
  const failed = setup(async () => { throw new HttpsError('unavailable', 'Provider unavailable'); }); business(failed);
  const before = structuredClone([...failed.records]);
  await assert.rejects(failed.call('verifyBusinessAbn', 'review-super', { businessId: 'example' }), { code: 'unavailable' });
  assert.deepEqual([...failed.records], before);
});
test('candidate guards reject inactive, member, cross-city and historical ABN operations before provider access', async () => {
  const state = setup(); business(state);
  for (const uid of ['review-inactive', 'review-member']) await assert.rejects(state.call('verifyBusinessAbn', uid, { businessId: 'example' }), { code: 'permission-denied' });
  state.records.get('businesses/example').location.city = 'melbourne';
  await assert.rejects(state.call('verifyBusinessAbn', 'review-admin', { businessId: 'example' }), { code: 'permission-denied' });
  state.records.get('businesses/example').status = 'archived';
  await assert.rejects(state.call('verifyBusinessAbn', 'review-super', { businessId: 'example' }), { code: 'failed-precondition' });
  assert.equal(state.lookups, 0);
});
test('native account archive moves owned events, disables calendar and Auth; restore leaves events and calendar archived', async () => {
  const state = setup();
  state.records.set('events/owned', { createdByUserId: 'review-customer', hostName: 'Synthetic host', city: 'sydney' });
  state.records.set('events/other', { createdByUserId: 'review-member' });
  state.records.set('calendarSubscriptions/review-customer', { active: true });
  const result = await state.call('adminDeleteUser', 'review-super', { targetUid: 'review-customer', ban: false });
  assert.equal(result.eventsArchived, 1);
  assert.equal(state.records.has('events/owned'), false); assert.equal(state.records.has('events/other'), true);
  assert.equal(state.records.get('archivedEvents/owned').archiveReason, 'creator_account_archived_by_admin');
  assert.equal(state.records.get('users/review-customer').isActive, false);
  assert.equal(state.records.get('calendarSubscriptions/review-customer').active, false);
  assert.equal(state.authUsers.get('review-customer').disabled, true);
  await state.call('adminRestoreUser', 'review-super', { targetUid: 'review-customer' });
  assert.equal(state.authUsers.get('review-customer').disabled, false);
  assert.equal(state.records.get('users/review-customer').isActive, true);
  assert.equal(state.records.get('archivedUsers/review-customer').archiveActive, false);
  assert.equal(state.records.get('calendarSubscriptions/review-customer').active, false);
  assert.equal(state.records.has('events/owned'), false);
});
test('restored listings retain archive history without being barred from a new ABN review', async () => {
  const state = setup(); business(state);
  Object.assign(state.records.get('businesses/example'), { status: 'pending', archivedAt: new Date(), restoredAt: new Date() });
  assert.equal((await state.call('verifyBusinessAbn', 'review-admin', { businessId: 'example' })).verified, true);
});
test('account archive rejects ordinary members, self and cross-city targets without writes', async () => {
  const state = setup();
  state.records.get('users/review-customer').defaultCity = 'melbourne';
  const before = structuredClone([...state.records]);
  await assert.rejects(state.call('adminDeleteUser', 'review-member', { targetUid: 'review-customer' }), { code: 'permission-denied' });
  await assert.rejects(state.call('adminDeleteUser', 'review-super', { targetUid: 'review-super' }), { code: 'invalid-argument' });
  await assert.rejects(state.call('adminDeleteUser', 'review-admin', { targetUid: 'review-customer' }), { code: 'permission-denied' });
  await assert.rejects(state.call('adminDeleteUser', 'review-super', { targetUid: 'real-user' }), { code: 'invalid-argument' });
  assert.deepEqual([...state.records], before);
});
test('restore requires a super administrator and the separate unban flow for banned accounts', async () => {
  const state = setup();
  await assert.rejects(state.call('adminRestoreUser', 'review-admin', { targetUid: 'review-customer' }), { code: 'permission-denied' });
  state.records.get('users/review-customer').accountStatus = 'banned';
  await assert.rejects(state.call('adminRestoreUser', 'review-super', { targetUid: 'review-customer' }), { code: 'failed-precondition' });
  await assert.rejects(state.call('adminRestoreUser', 'review-inactive', { targetUid: 'review-customer' }), { code: 'permission-denied' });
});
