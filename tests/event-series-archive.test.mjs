import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { build } from 'esbuild';
import { createEventSeriesArchive } from '../src/services/eventSeriesArchive.mjs';
import { isFutureSeriesEvent } from '../src/utils/eventSeriesScope.mjs';
const now = new Date('2026-10-10T00:00:00Z');
const future = { id: 'future', seriesId: 'series', eventDate: '2026-10-11', startTime: '14:00', status: 'active', metroArea: 'sydney' };
function setup(overrides = {}) {
  let uid = 'admin';
  const calls = [];
  const api = createEventSeriesArchive({ now: () => now, session: async () => uid,
    readSeries: async () => [future],
    archive: async payload => { calls.push(payload); return { archived: 1, archivedIds: ['future'] }; }, ...overrides });
  return { api, calls, account: value => { uid = value; } };
}
test('web future-occurrence selection keeps exact parity with native timezone and eligibility logic', async () => {
  const native = await fs.readFile(new URL('../../sdk51-package-backup/backend/functions-lifecycle/seriesScope.js', import.meta.url), 'utf8');
  const web = await fs.readFile(new URL('../src/utils/eventSeriesScope.mjs', import.meta.url), 'utf8');
  assert.equal(web.replace('export { isFutureSeriesEvent };', 'module.exports = { isFutureSeriesEvent };').replace(/\r\n/g, '\n'), native.replace(/\r\n/g, '\n'));
  assert.equal(isFutureSeriesEvent({ ...future, eventDate: '2026-10-10', startTime: '10:30' }, now), false);
  assert.equal(isFutureSeriesEvent({ ...future, metroArea: 'perth', eventDate: '2026-10-10', startTime: '10:30' }, now), true);
  for (const change of [{ isLive: true }, { status: 'archived' }, { eventDate: '2026-02-30' }, { eventDate: '2026-10-09' }])
    assert.equal(isFutureSeriesEvent({ ...future, ...change }, now), false);
});
test('series preparation merges both native ID fields, deduplicates and excludes historical/live events', async () => {
  const { api } = setup({ readSeries: async field => field === 'seriesId' ? [future, { ...future, id: 'live', isLive: true }]
    : [future, { ...future, id: 'legacy', seriesId: undefined, recurringSeriesId: 'series' }, { ...future, id: 'past', eventDate: '2026-10-09' }, { ...future, id: 'other', seriesId: 'another' }] });
  const selected = await api.prepare(future);
  assert.deepEqual(selected.expectedIds, ['future', 'legacy']);
});
test('series confirmation sends only the dedicated native callable payload and checks identity', async () => {
  const state = setup(), selection = await state.api.prepare(future);
  assert.deepEqual(await state.api.confirm({ ...selection, role: 'superAdmin', deleteAll: true }), { archived: 1, archivedIds: ['future'], remaining: 0 });
  assert.deepEqual(state.calls, [{ seriesId: 'series', expectedIds: ['future'] }]);
  state.account('another');
  await assert.rejects(state.api.confirm(selection), /account changed/);
  assert.equal(state.calls.length, 1);
});
test('series preparation discards data if the account changes during its reads', async () => {
  let calls = 0;
  const state = setup({ session: async () => ++calls === 1 ? 'first' : 'second' });
  await assert.rejects(state.api.prepare(future), /account changed/);
});
test('invalid, empty and oversized series selections cannot invoke archival', async () => {
  const state = setup();
  await assert.rejects(state.api.prepare({}), /valid reference/);
  await assert.rejects(setup({ readSeries: async () => [] }).api.prepare(future), /No future/);
  await assert.rejects(setup({ readSeries: async () => Array.from({ length: 501 }, (_, i) => ({ ...future, id: String(i) })) }).api.prepare(future), /too large/);
  for (const expectedIds of [[], ['x','x'], ['events/x']]) await assert.rejects(state.api.confirm({ seriesId: 'series', expectedIds }), /Reopen/);
  assert.equal(state.calls.length, 0);
});
test('partial and zero native acknowledgements are explicit; malformed results cannot claim success', async () => {
  for (const archivedIds of [[], ['future']]) {
    const state = setup({ archive: async () => ({ archived: archivedIds.length, archivedIds }) });
    const selected = { ...(await state.api.prepare(future)), expectedIds: ['future', 'another'] };
    assert.equal((await state.api.confirm(selected)).remaining, 2 - archivedIds.length);
  }
  for (const result of [{}, { archived: 2, archivedIds: ['future'] }, { archived: 2, archivedIds: ['future','future'] }, { archived: 1, archivedIds: ['foreign'] }]) {
    const state = setup({ archive: async () => result });
    await assert.rejects(state.api.confirm(await state.api.prepare(future)), /could not be confirmed/);
  }
});
test('native stale-selection errors propagate without a fallback delete or retry', async () => {
  let calls = 0;
  const state = setup({ archive: async () => { calls++; throw new Error('Remaining events have changed.'); } });
  await assert.rejects(state.api.confirm(await state.api.prepare(future)), /have changed/);
  assert.equal(calls, 1);
});

async function adapter({ readOnly = false, role = 'admin' } = {}) {
  const calls = [], auth = { currentUser: { uid: 'test-admin', isAnonymous: false } };
  const bundled = await build({ entryPoints: ['src/services/eventSeriesService.js'], bundle: true, write: false, platform: 'node', format: 'cjs',
    define: { 'import.meta.env.VITE_READ_ONLY_PREVIEW': JSON.stringify(String(readOnly)) },
    plugins: [{ name: 'isolated-series-sdk', setup(builder) {
      builder.onResolve({ filter: /firebase\/|firebase\/firebase/ }, args => ({ path: args.path, namespace: 'sdk' }));
      builder.onLoad({ filter: /.*/, namespace: 'sdk' }, args => ({ contents: args.path === 'firebase/functions'
        ? 'export const httpsCallable = (_, name) => payload => globalThis.invoke(name,payload);'
        : args.path === 'firebase/firestore'
          ? 'export const collection=(...v)=>v,query=(...v)=>v,where=(...v)=>v,doc=(...v)=>v; export const getDocsFromServer=async()=>({docs:[]}); export const getDocFromServer=async()=>({exists:()=>true,data:()=>({role:globalThis.role,isActive:true})});'
          : 'export const auth=globalThis.auth,db={},functions={};' }));
    } }] });
  const module = { exports: {} };
  vm.runInNewContext(bundled.outputFiles[0].text, { module, exports: module.exports, role, auth,
    invoke: async (name, payload) => { calls.push({ name, payload }); return { data: { archived: 1, archivedIds: ['future'] } }; } });
  return { ...module.exports, calls };
}
test('Firebase series adapter uses guarded future archival and refuses read-only and ordinary-member access', async () => {
  const input = { uid: 'test-admin', seriesId: 'series', expectedIds: ['future'] };
  const allowed = await adapter();
  await allowed.confirmEventSeriesArchive(input);
  assert.equal(allowed.calls[0].name, 'callWebMemberOperation');
  assert.equal(allowed.calls[0].payload.operation, 'archiveFutureSeriesEvents');
  for (const settings of [{ readOnly: true }, { role: 'user' }]) {
    const denied = await adapter(settings);
    await assert.rejects(denied.confirmEventSeriesArchive(input), /read-only|administrator/);
    assert.equal(denied.calls.length, 0);
  }
});
