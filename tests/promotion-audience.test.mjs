import test from 'node:test';
import assert from 'node:assert/strict';
import { PROMOTION_AUDIENCE_ENABLED } from '../src/config/releaseGates.mjs';
import { promotionSubmission } from '../src/business/workspaceModel.mjs';
import { createDirectoryGateway } from '../src/services/directory/gateway.mjs';
import { recordingFirestore } from './firebase-integration/recordingFirestore.mjs';
import { identities, seedRecords } from './firebase-integration/fixtures.mjs';
import { activePublicPromotions, toPublicPromotion } from '../src/utils/publicPromotions.mjs';

function fixture(enabled = true, identity = 'admin', fail = false) {
  const transport = recordingFirestore(seedRecords()), calls = [];
  const gateway = createDirectoryGateway({ db: {}, user: identities[identity], sdk: transport.sdk,
    promotionAudienceEnabled: enabled, callFunction: async (name, payload) => {
      calls.push({ name, payload }); if (fail) throw Error('Backend unavailable'); return { ok: true };
    } });
  return { ...transport, calls, gateway };
}

test('promotion audience defaults off; owner payloads never carry approval authority', () => {
  assert.equal(PROMOTION_AUDIENCE_ENABLED, false);
  const form = { requestedAudience: 'australia', approvedAudience: 'australia', approvedBy: 'forged' };
  assert.equal(promotionSubmission(form).requestedAudience, undefined);
  assert.equal(promotionSubmission(form, true).requestedAudience, 'australia');
  assert.equal(promotionSubmission({}, true).requestedAudience, 'local');
  assert.equal(promotionSubmission(form, true).approvedAudience, undefined);
});

test('owner save stores only requested audience when enabled and rejects invalid choices', async () => {
  for (const enabled of [false, true]) {
    const state = fixture(enabled, 'member');
    const original = state.records.get('businessPromotions/offer');
    await state.gateway.action('promotion.save', { ...original, id: 'offer', requestedAudience: 'australia', approvedAudience: 'australia' });
    const saved = state.records.get('businessPromotions/offer');
    assert.equal(saved.requestedAudience, enabled ? 'australia' : undefined);
    assert.equal(saved.approvedAudience, undefined); assert.equal(saved.status, 'pending');
  }
  const state = fixture(true, 'member');
  await assert.rejects(state.gateway.action('promotion.save', { ...state.records.get('businessPromotions/offer'), id: 'offer', requestedAudience: 'world' }), /Choose local/);
  assert.equal(state.writes.length, 0);
});

test('enabled approval requires confirmation, forbids broadening, and never falls back after callable failure', async () => {
  const state = fixture();
  for (const options of [{ audience: 'local' }, { audience: 'australia', confirmAudience: true }, { audience: 'world', confirmAudience: true }]) {
    await assert.rejects(state.gateway.action('promotion.approve', { id: 'offer', ...options }));
  }
  assert.equal(state.calls.length, 0); assert.equal(state.writes.length, 0);
  state.records.get('businessPromotions/offer').requestedAudience = 'australia';
  await state.gateway.action('promotion.approve', { id: 'offer', audience: 'australia', confirmAudience: true, boosted: true, approvedBy: 'forged' });
  assert.deepEqual(state.calls, [{ name: 'approvePromotionAudience', payload: { promotionId: 'offer', audience: 'australia', confirmAudience: true, boosted: true } }]);
  assert.equal(state.writes.length, 0);
  await state.gateway.action('promotion.approve', { id: 'offer', audience: 'local', confirmAudience: true });
  assert.equal(state.calls[1].payload.audience, 'local');
  const failed = fixture(true, 'admin', true);
  await assert.rejects(failed.gateway.action('promotion.approve', { id: 'offer', audience: 'local', confirmAudience: true }), /Backend unavailable/);
  assert.equal(failed.writes.length, 0);
});

test('feature-off approval keeps legacy local writes; enabled review keeps native admin-only central authority', async () => {
  const legacy = fixture(false);
  await legacy.gateway.action('promotion.approve', { id: 'offer', boosted: false });
  assert.equal(legacy.calls.length, 0);
  assert.equal(legacy.records.get('publicBusinessPromotions/offer').status, 'active');
  assert.equal(legacy.records.get('publicBusinessPromotions/offer').approvedAudience, undefined);
  for (const identity of ['member', 'inactive']) {
    const state = fixture(true, identity);
    await assert.rejects(state.gateway.action('promotion.approve', { id: 'offer', audience: 'local', confirmAudience: true }));
    assert.equal(state.calls.length, 0); assert.equal(state.writes.length, 0);
  }
  for (const enabled of [false, true]) {
    const state = fixture(enabled);
    state.records.get('businessPromotions/offer').businessId = 'melbourne';
    const action = state.gateway.action('promotion.approve', { id: 'offer', audience: 'local', confirmAudience: true });
    if (enabled) { await action; assert.equal(state.calls.length, 1); }
    else await assert.rejects(action, /outside your administration city/);
  }
});

test('only approved national public offers cross city filters; dates and visible parent still apply', () => {
  const base = { businessId: 'b', title: 'Offer', status: 'active', startDate: '2099-01-01', endDate: '2099-01-31' };
  const rows = [toPublicPromotion('national', { ...base, approvedAudience: 'australia' }),
    toPublicPromotion('requested-only', { ...base, requestedAudience: 'australia' }),
    toPublicPromotion('invalid', { ...base, approvedAudience: 'world' })];
  const businesses = [{ id: 'b', city: 'melbourne' }];
  const options = { city: 'sydney', today: '2099-01-15', audienceEnabled: true };
  assert.deepEqual(activePublicPromotions(rows, businesses, options).map(row => row.id), ['national']);
  for (const overrides of [{ audienceEnabled: false }, { today: '2099-02-01' }, { today: '2098-12-31' }, { businessId: 'other' }]) {
    assert.deepEqual(activePublicPromotions(rows, businesses, { ...options, ...overrides }), []);
  }
  assert.deepEqual(activePublicPromotions(rows, [], options), []);
  assert.equal(toPublicPromotion('hidden', { ...base, approvedAudience: 'australia', hidden: true }), null);
});
