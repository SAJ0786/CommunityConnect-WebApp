import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { register } from './firebase-integration/functions/native/event-archive.cjs';
import { createReviewGuard } from './firebase-integration/functions/review-guards.cjs';
import { recordingAdmin } from './firebase-integration/recordingAdmin.mjs';
import { seedRecords } from './firebase-integration/fixtures.mjs';
class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
const future = { eventDate: '2099-10-11', startTime: '18:00', status: 'active', city: 'sydney', createdByUserId: 'review-member', seriesId: 'archive-series' };
function setup(extra = {}) {
  const state = recordingAdmin({ ...seedRecords(), ...extra });
  const dependencies = { ...state, HttpsError, REGION: 'australia-southeast1', onCall: (_, handler) => handler };
  const handlers = register(dependencies), guard = createReviewGuard(dependencies);
  return { ...state, call: async (name, uid, data) => {
    const input = { auth: { uid, token: { firebase: { sign_in_provider: 'phone' } } }, data };
    await guard(name, input); return handlers[name](input);
  } };
}

test('frozen deployed archive fixtures retain their reviewed hashes independently of newer native candidates', async () => {
  // These fixtures represent the deployed legacy contract, not an undeployed native working tree.
  const snapshot = await fs.readFile(new URL('./firebase-integration/functions/native/event-archive.cjs', import.meta.url), 'utf8');
  const excerpt = (a, b) => snapshot.slice(snapshot.indexOf(a), snapshot.indexOf(b, snapshot.indexOf(a))).trim();
  const body = [excerpt('function city(value)', 'exports.archiveEventRecords ='), excerpt('exports.archiveEventRecords =', 'return exports;')].join('\n');
  const hashes = JSON.parse(await fs.readFile(new URL('./firebase-integration/functions/native/source-hashes.json', import.meta.url), 'utf8'));
  assert.equal(createHash('sha256').update(body).digest('hex'), hashes['event-archive-source-excerpt']);
  const helper = await fs.readFile(new URL('./firebase-integration/functions/native/seriesScope.cjs', import.meta.url));
  assert.equal(createHash('sha256').update(helper).digest('hex'), hashes['seriesScope.cjs']);
});

test('single event owner archival preserves the record and audit metadata', async () => {
  const state = setup({ 'events/single': { ...future, notes: 'Retained history' } });
  assert.deepEqual(await state.call('archiveEventRecords', 'review-member', { eventId: 'single' }), { archived: 1 });
  assert.equal(state.records.has('events/single'), false);
  const record = state.records.get('archivedEvents/single');
  assert.equal(record.notes, 'Retained history');
  assert.equal(record.archivedBy, 'review-member');
  assert.equal(record.archivedFromEventId, 'single');
  assert.equal(record.status, 'inactive');
});

test('single archival denies non-owner, cross-city, inactive, live and old all-series requests without writes', async () => {
  for (const [uid, changes, data, code] of [
    ['review-customer', {}, { eventId: 'single' }, 'permission-denied'],
    ['review-admin', { city: 'melbourne' }, { eventId: 'single' }, 'permission-denied'],
    ['review-inactive', { createdByUserId: 'review-inactive' }, { eventId: 'single' }, 'permission-denied'],
    ['review-member', { isLive: true }, { eventId: 'single' }, 'failed-precondition'],
    ['review-super', {}, { seriesId: 'archive-series' }, 'invalid-argument'],
    ['review-super', {}, { eventId: 'single', seriesId: 'archive-series' }, 'invalid-argument'],
    ['review-super', {}, { eventId: 'events/single' }, 'invalid-argument'],
  ]) {
    const state = setup({ 'events/single': { ...future, ...changes } }), before = [...state.records];
    await assert.rejects(state.call('archiveEventRecords', uid, data), { code });
    assert.deepEqual([...state.records], before);
  }
});

test('future series archival merges both ID fields and preserves past, live and inactive records', async () => {
  const state = setup({
    'events/first': future,
    'events/legacy': { ...future, seriesId: null, recurringSeriesId: 'archive-series' },
    'events/both': { ...future, recurringSeriesId: 'archive-series' },
    'events/past': { ...future, eventDate: '2000-01-01' },
    'events/live': { ...future, isLive: true },
    'events/inactive': { ...future, status: 'inactive' },
    'recurringEventSeries/archive-series': { status: 'active', title: 'Retained series' },
  });
  const result = await state.call('archiveFutureSeriesEvents', 'review-admin', { seriesId: 'archive-series', expectedIds: ['first', 'legacy', 'both'] });
  assert.equal(result.archived, 3);
  assert.deepEqual(result.archivedIds.sort(), ['both', 'first', 'legacy']);
  for (const id of ['first', 'legacy', 'both']) {
    assert.equal(state.records.has('events/' + id), false);
    assert.equal(state.records.get('archivedEvents/' + id).archiveReason, 'future_series_archived_by_user_or_admin');
  }
  for (const id of ['past', 'live', 'inactive']) assert.equal(state.records.has('events/' + id), true);
  assert.equal(state.records.get('recurringEventSeries/archive-series').status, 'active');
  assert.equal(state.records.get('recurringEventSeries/archive-series').lastFutureDeletionCount, 3);
});

test('stale selections, mixed-city series, non-admin owners and inactive accounts cannot archive series', async () => {
  for (const [uid, second, ids, code] of [
    ['review-admin', future, ['first'], 'failed-precondition'],
    ['review-admin', { ...future, city: 'melbourne' }, ['first', 'second'], 'permission-denied'],
    ['review-member', future, ['first', 'second'], 'permission-denied'],
    ['review-inactive', future, ['first', 'second'], 'permission-denied'],
    ['review-super', future, ['first', 'first'], 'invalid-argument'],
  ]) {
    const state = setup({ 'events/first': future, 'events/second': second }), before = [...state.records];
    await assert.rejects(state.call('archiveFutureSeriesEvents', uid, { seriesId: 'archive-series', expectedIds: ids }), { code });
    assert.deepEqual([...state.records], before);
  }
  const state = setup({ 'events/other-city': { ...future, city: 'melbourne' } });
  assert.equal((await state.call('archiveFutureSeriesEvents', 'review-super', { seriesId: 'archive-series', expectedIds: ['other-city'] })).archived, 1);
});

test('transaction recheck retains an event that became live after selection and reports the actual count', async () => {
  const state = setup({ 'events/first': future, 'events/second': future });
  const transaction = state.db.runTransaction.bind(state.db);
  state.db.runTransaction = async callback => {
    state.records.set('events/second', { ...future, isLive: true });
    return transaction(callback);
  };
  const result = await state.call('archiveFutureSeriesEvents', 'review-admin', { seriesId: 'archive-series', expectedIds: ['first', 'second'] });
  assert.deepEqual(result, { archived: 1, archivedIds: ['first'] });
  assert.equal(state.records.get('events/second').isLive, true);
  assert.equal(state.records.has('archivedEvents/second'), false);
});
