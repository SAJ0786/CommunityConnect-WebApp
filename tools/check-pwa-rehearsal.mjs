import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { startRehearsal } from '../tests/pwa-rehearsal/server.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const output = path.resolve(process.argv[2] || '.qa-pwa-rehearsal');
await fs.mkdir(output, { recursive:true });
const report = { startedAt:new Date().toISOString(), status:'running', checks:[], errors:[], remote:[] };
let server, browser, page;
try {
  server = await startRehearsal();
  report.origin = server.origin;
  browser = await chromium.launch({ channel:'msedge', headless:true });
  const context = await browser.newContext({ serviceWorkers:'allow' });
  context.setDefaultTimeout(15000);
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin !== server.origin) {
      report.remote.push(route.request().url());
      return route.abort();
    }
    return route.continue();
  });
  context.on('page', tab => tab.on('pageerror', error => report.errors.push(error.message)));
  const check = (name, condition = true) => { assert.ok(condition, name); report.checks.push(name); console.log('PASS:', name); };
  const releaseIs = (tab, value) => tab.waitForFunction(value => document.querySelector('#release')?.textContent === value, value);
  const update = tab => tab.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
  const resume = tab => tab.evaluate(() => window.dispatchEvent(new Event('online')));
  const cacheNames = tab => tab.evaluate(() => caches.keys());

  page = await context.newPage();
  const deepLink = '/businesses/view/example?city=sydney#offers';
  await page.goto(server.origin + deepLink);
  await releaseIs(page, 'A');
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  check('first installation controls the synthetic page without a forced reload', !new URL(page.url()).searchParams.has('app-update'));

  server.setRelease('broken');
  const failedState = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Broken worker did not finish installation')), 15000);
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker.addEventListener('statechange', () => {
          if (['redundant','installed'].includes(worker.state)) { clearTimeout(timer); resolve(worker.state); }
        });
      }, { once:true });
      registration.update().catch(error => { clearTimeout(timer); reject(error); });
    });
  });
  check('missing candidate asset rejects worker installation', failedState === 'redundant');
  check('previous working release remains available after failed install', (await cacheNames(page)).includes('ce-v101-static') && await page.locator('#release').textContent() === 'A');

  await page.getByLabel('Unsaved draft').fill('Keep this unsaved synthetic message');
  await page.locator('#blur').click();
  server.setRelease('B');
  await update(page);
  await page.waitForFunction(async () => Boolean((await navigator.serviceWorker.getRegistration())?.waiting));
  check('dirty page defers candidate activation', await page.locator('#release').textContent() === 'A');
  const second = await context.newPage();
  await second.goto(server.origin + '/');
  await releaseIs(second, 'B');
  await page.waitForFunction(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    return !registration.waiting && (await caches.keys()).includes('ce-v202-static');
  });
  check('another tab activates without discarding the first tab draft', await page.getByLabel('Unsaved draft').inputValue() === 'Keep this unsaved synthetic message' && await page.locator('#release').textContent() === 'A');
  check('previous asset generation survives deferred reload', (await cacheNames(page)).includes('ce-v101-static'));
  await page.getByLabel('Unsaved draft').fill('');
  await page.locator('#blur').click();
  await resume(page);
  await releaseIs(page, 'B');
  const location = new URL(page.url());
  check('safe update preserves deep-link path, city and hash', location.pathname === '/businesses/view/example' && location.searchParams.get('city') === 'sydney' && location.hash === '#offers' && location.searchParams.has('app-update'));
  await page.screenshot({ path:path.join(output,'upgraded.png'), fullPage:true });
  await second.close();

  await context.setOffline(true);
  await page.goto(server.origin + '/businesses/view/unvisited?city=sydney#offers');
  await releaseIs(page, 'B');
  check('unvisited Directory deep link loads the cached current shell offline');
  check('older hashed asset is readable offline', await page.evaluate(async () => (await fetch('/assets/release-A.js')).ok));
  await page.goto(server.origin + '/unvisited-guide.html');
  await page.getByRole('heading', { name:'This page needs a connection' }).waitFor();
  check('unvisited static page gets the offline explanation');
  const actionOffline = await page.evaluate(async () => { try { await fetch('/cal?token=synthetic'); return false; } catch { return true; } });
  check('offline server-backed action does not receive cached success', actionOffline);
  await page.screenshot({ path:path.join(output,'offline.png'), fullPage:true });

  await context.setOffline(false);
  // A fresh tab has no reload-loop cooldown from the prior update; caches and
  // the registration stay in the same browser context throughout rollback.
  const rollback = await context.newPage();
  await rollback.goto(server.origin + deepLink);
  await releaseIs(rollback, 'B');
  await page.close();
  page = rollback;
  server.setRelease('A');
  await update(page);
  await releaseIs(page, 'A');
  await page.waitForFunction(async () => (await caches.keys()).includes('ce-v101-static'));
  check('rollback returns to A in the same profile without clearing storage');
  await context.setOffline(true);
  await page.reload();
  await releaseIs(page, 'A');
  check('rolled-back release launches offline');
  check('previous B asset remains available after rollback', await page.evaluate(async () => (await fetch('/assets/release-B.js')).ok));
  check('no browser runtime errors', report.errors.length === 0);
  check('no remote page requests', report.remote.length === 0);
  report.status = 'passed';
  console.log(`PWA rehearsal passed: ${report.checks.length} checks. Evidence: ${output}`);
} catch (error) {
  report.status = 'failed';
  report.failure = error.stack || String(error);
  if (page && !page.isClosed()) await page.screenshot({ path:path.join(output,'failure.png'), fullPage:true }).catch(() => {});
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  await server?.close();
  report.finishedAt = new Date().toISOString();
  report.requests = server?.requests || [];
  await fs.writeFile(path.join(output,'results.json'), JSON.stringify(report,null,2));
}
