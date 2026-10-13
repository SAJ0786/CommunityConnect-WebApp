import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { build } from 'esbuild';
async function service(call) {
  const result = await build({ entryPoints: ['src/services/eventService.js'], bundle: true, write: false, platform: 'node', format: 'cjs',
    plugins: [{ name: 'isolated-event-sdk', setup(builder) {
      builder.onResolve({ filter: /firebase\/|firebase\/firebase/ }, args => ({ path: args.path, namespace: 'test-sdk' }));
      builder.onLoad({ filter: /.*/, namespace: 'test-sdk' }, args => ({ contents: args.path === 'firebase/functions'
        ? 'export const httpsCallable = (_,name) => payload => globalThis.call(name,payload);'
        : args.path === 'firebase/firestore'
          ? 'const denied=()=>{throw new Error("Unexpected Firestore access");}; export {denied as addDoc,denied as collection,denied as doc,denied as getDocs,denied as orderBy,denied as query,denied as serverTimestamp,denied as updateDoc,denied as where,denied as onSnapshot,denied as limit};'
          : 'export const db={}; export const functions={};' }));
    } }] });
  const module = { exports: {} };
  vm.runInNewContext(result.outputFiles[0].text, { module, exports: module.exports, call });
  return module.exports;
}
test('web event deletion uses native archival and requires an acknowledged archive result', async () => {
  const calls = [];
  const api = await service(async (name, payload) => { calls.push({ name, ...payload }); return { data: { archived: 1 } }; });
  assert.equal((await api.deleteEvent('example')).archived, 1);
  assert.equal(JSON.stringify(calls), JSON.stringify([{ name: 'callWebMemberOperation', operation: 'archiveEventRecords', payload: { eventId: 'example' } }]));
  await assert.rejects(api.deleteEvent('events/example'), /valid event reference/);
  assert.equal(calls.length, 1);
  const unavailable = await service(async () => { throw new Error('Function unavailable'); });
  await assert.rejects(unavailable.deleteEvent('example'), /Function unavailable/);
  for (const result of [{}, { data: { archived: 0 } }, { data: { archived: '1' } }]) {
    const uncertain = await service(async () => result);
    await assert.rejects(uncertain.deleteEvent('example'), /Could not confirm/);
  }
});
