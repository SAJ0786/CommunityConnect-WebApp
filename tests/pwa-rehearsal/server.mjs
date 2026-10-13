import http from 'node:http';
import { readFile } from 'node:fs/promises';

const releases = { A: 101, B: 202, broken: 303 };
const file = relative => readFile(new URL(relative, import.meta.url));

// No production app, Firebase config, accounts or externally accessible listener.
// Use the real worker/client sources with two small synthetic release bundles.
export async function startRehearsal() {
  const worker = (await file('../../public/sw.js')).toString();
  const client = await file('../../src/services/swService.js');
  const registration = await file('../../src/services/workerRegistration.mjs');
  const offline = await file('../../public/offline.html');
  const icons = { '/icons/icon-192.png': await file('../../public/icons/icon-192.png'), '/icons/icon-512.png': await file('../../public/icons/icon-512.png') };
  let release = 'A';
  const requests = [];
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    requests.push({ method: request.method, pathname, release });
    const send = (status, type, body) => {
      response.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      response.end(body);
    };
    if (request.method !== 'GET') return send(405, 'text/plain', 'Read-only rehearsal');
    const assets = [`/assets/release-${release}.js`, '/assets/sw-client.js', '/assets/workerRegistration.mjs'];
    if (release === 'broken') assets.push('/assets/intentionally-missing.js');
    if (pathname === '/sw.js') return send(200, 'application/javascript', worker.replaceAll('__BUILD_TIME__', String(releases[release])).replace('/* __BUILD_ASSETS__ */ []', JSON.stringify(assets)));
    if (pathname === '/assets/sw-client.js') return send(200, 'application/javascript', client);
    if (pathname === '/assets/workerRegistration.mjs') return send(200, 'application/javascript', registration);
    if (pathname === `/assets/release-${release}.js`) return send(200, 'application/javascript', `import { registerSW } from '/assets/sw-client.js';
document.querySelector('#release').textContent = '${release}';
window.__communityDirectoryCanAutoUpdate = () => !document.querySelector('#draft').value;
await registerSW();`);
    if (pathname === '/manifest.json') return send(200, 'application/manifest+json', JSON.stringify({ id:'/', start_url:'/', scope:'/', name:'Local PWA rehearsal', display:'standalone', icons:[] }));
    if (icons[pathname]) return send(200, 'image/png', icons[pathname]);
    if (pathname === '/offline.html') return send(200, 'text/html', offline);
    if (pathname === '/' || pathname === '/index.html' || /^\/businesses(?:\/|$)/.test(pathname)) return send(200, 'text/html', `<!doctype html><html lang="en"><head><meta charset="utf-8"><link rel="icon" href="/icons/icon-192.png"><link rel="manifest" href="/manifest.json"><title>Local PWA rehearsal</title></head><body><h1>Local PWA rehearsal</h1><p>Synthetic content only. Release <output id="release"></output></p><label for="draft">Unsaved draft</label><textarea id="draft"></textarea><button id="blur">Finish editing</button><script type="module" src="/assets/release-${release}.js"></script></body></html>`);
    return send(404, 'text/plain', 'Not part of the local rehearsal');
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    requests,
    setRelease(next) { if (!(next in releases)) throw new Error('Unknown rehearsal release'); release = next; },
    close() { server.closeAllConnections(); return new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); },
  };
}
