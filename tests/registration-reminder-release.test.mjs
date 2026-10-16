import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { build } from 'esbuild';
import { REGISTRATION_REMINDERS_ENABLED, REGISTRATION_REMINDER_HOLD } from '../src/config/releaseGates.mjs';
import { eventActions } from '../src/utils/eventActions.mjs';

test('ordinary reminder production flag cannot release registration reminder calls or notification setup', async () => {
  const calls = [];
  const bundled = await build({ entryPoints:['src/services/eventReminderService.js'], bundle:true, write:false,
    platform:'node', format:'cjs', define:{ 'import.meta.env':JSON.stringify({ VITE_EVENT_REMINDERS_ENABLED:'true' }) },
    plugins:[{ name:'offline-reminder-release', setup(builder) {
      builder.onResolve({ filter:/firebase\/functions|firebase\/firebase|notificationService/ }, args => ({ path:args.path, namespace:'offline' }));
      builder.onLoad({ filter:/.*/, namespace:'offline' }, args => ({ contents:args.path.includes('notificationService')
        ? "export const enablePushNotifications=async()=>{globalThis.calls.push('push');return 'token';};"
        : args.path === 'firebase/functions'
          ? "export const httpsCallable=(_functions,name)=>async()=>{globalThis.calls.push(name);return {data:{reminder:null}};};"
          : "export const auth={currentUser:{uid:'member'}};export const functions={};" }));
    } }],
  });
  const context = { module:{ exports:{} }, calls, localStorage:{ getItem:()=>'synthetic-browser-1234' } };
  vm.runInNewContext(bundled.outputFiles[0].text, context);
  const api = context.module.exports;
  assert.equal(REGISTRATION_REMINDERS_ENABLED, false);
  for (const operation of [
    () => api.getEventReminder('registration', true),
    () => api.setEventReminder('registration', 30, true),
    () => api.removeEventReminder('registration', true),
  ]) await assert.rejects(operation(), error => error.message === REGISTRATION_REMINDER_HOLD);
  assert.deepEqual(calls, [], 'No callable, token or push setup may run for held registration reminders');
  await api.getEventReminder('ordinary');
  assert.deepEqual(calls, ['getEventReminder'], 'Ordinary reminders retain their existing release flag');
  const action = eventActions({ event:{ registrationOnly:true, startTime:'18:00', startAt:'2026-12-01T07:00:00Z' },
    member:true, handlers:{ reminder(){} } }).find(action => action.id === 'reminder');
  assert.equal(action.disabled, true);
  assert.equal(action.reason, REGISTRATION_REMINDER_HOLD);
});
