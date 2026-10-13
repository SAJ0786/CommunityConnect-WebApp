import test from 'node:test';
import assert from 'node:assert/strict';
import { startRehearsal } from './pwa-rehearsal/server.mjs';

test('rehearsal serves complete synthetic releases, an intentionally broken install and exact rollback', async () => {
  const server = await startRehearsal();
  try {
    const original = await (await fetch(server.origin+'/sw.js')).text();
    assert.ok(original.includes('ce-v101'));
    assert.ok(!original.includes('__BUILD_TIME__'));
    for (const release of ['A','B']) {
      server.setRelease(release);
      for (const route of ['/', '/index.html', '/businesses/view/example?city=sydney', '/manifest.json', '/offline.html', '/icons/icon-192.png', '/icons/icon-512.png', '/assets/sw-client.js', '/assets/workerRegistration.mjs', `/assets/release-${release}.js`]) {
        assert.equal((await fetch(server.origin+route)).status,200,`${release}: ${route}`);
      }
    }
    assert.equal((await fetch(server.origin+'/assets/release-A.js')).status,404,'old assets must come from worker cache, not the server');
    server.setRelease('broken');
    assert.ok((await (await fetch(server.origin+'/sw.js')).text()).includes('/assets/intentionally-missing.js'));
    assert.equal((await fetch(server.origin+'/assets/intentionally-missing.js')).status,404);
    server.setRelease('A');
    assert.equal(await (await fetch(server.origin+'/sw.js')).text(),original);
  } finally { await server.close(); }
});

test('rehearsal uses only loopback, denies mutations and has no live API fallback', async () => {
  const server = await startRehearsal();
  try {
    assert.equal(new URL(server.origin).hostname,'127.0.0.1');
    for (const route of ['/api/private','/cal?token=synthetic','/__/auth/handler','/unvisited-guide.html']) assert.equal((await fetch(server.origin+route)).status,404);
    assert.equal((await fetch(server.origin+'/',{method:'POST',body:'test'})).status,405);
    assert.throws(()=>server.setRelease('live'),/Unknown/);
  } finally { await server.close(); }
});
