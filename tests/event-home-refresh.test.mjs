import test from 'node:test';
import assert from 'node:assert/strict';
import { startHomeRefresh, HOME_REFRESH_MS } from '../src/utils/homeRefresh.mjs';
function fixture(refresh) {
  const page = new EventTarget(); page.hidden = false;
  const browser = new EventTarget(), network = { onLine: true };
  let timer, cleared = false;
  browser.setInterval = (fn, ms) => { assert.equal(ms, 60000); timer = fn; return 12; };
  browser.clearInterval = id => { assert.equal(id, 12); cleared = true; };
  const stop = startHomeRefresh(refresh, { page, browser, network });
  return { page, browser, network, stop, tick: () => timer(), cleared: () => cleared };
}
const settle = () => new Promise(resolve => setImmediate(resolve));
test('Home refreshes on entry, every minute, focus, foreground and reconnect, then stops on departure', async () => {
  const reasons = [], state = fixture(reason => reasons.push(reason));
  await settle(); assert.deepEqual(reasons, ['enter']); assert.equal(HOME_REFRESH_MS, 60000);
  await state.tick(); assert.equal(reasons.length, 2);
  state.page.hidden = true; await state.tick(); state.browser.dispatchEvent(new Event('focus')); await settle();
  assert.equal(reasons.length, 2);
  state.page.hidden = false; state.page.dispatchEvent(new Event('visibilitychange')); await settle(); assert.equal(reasons.length, 3);
  state.network.onLine = false; await state.tick(); assert.equal(reasons.length, 3);
  state.network.onLine = true; state.browser.dispatchEvent(new Event('online')); await settle(); assert.equal(reasons.length, 4);
  state.browser.dispatchEvent(new Event('focus')); await settle(); assert.equal(reasons.length, 5);
  state.stop(); assert.equal(state.cleared(), true);
  await state.tick(); state.page.dispatchEvent(new Event('visibilitychange')); state.browser.dispatchEvent(new Event('online')); state.browser.dispatchEvent(new Event('focus')); await settle(); assert.equal(reasons.length, 5);
  const next = fixture(() => reasons.push('return')); await settle(); assert.equal(reasons.at(-1), 'return'); next.stop();
});
test('slow refreshes coalesce triggers and failure does not stop later refreshes', async () => {
  let calls = 0, release;
  const state = fixture(() => { calls++; return new Promise(resolve => { release = resolve; }); });
  await state.tick(); state.browser.dispatchEvent(new Event('focus')); assert.equal(calls, 1);
  release(); await settle(); const next = state.tick(); assert.equal(calls, 2); release(); await next; state.stop();
  const warn = console.warn; console.warn = () => {};
  try { let attempts = 0; const failure = fixture(() => { if (++attempts === 1) throw Error('Offline'); }); await settle(); await failure.tick(); assert.equal(attempts, 2); failure.stop(); }
  finally { console.warn = warn; }
});
