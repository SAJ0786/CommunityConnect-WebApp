import test from 'node:test';
import assert from 'node:assert/strict';
import { directoryBrowseRoute, openDirectory } from '../src/utils/businessRoutes.mjs';

test('only browse and promotions URLs are eligible for the authenticated Directory shell', () => {
  assert.deepEqual(directoryBrowseRoute('/businesses/'), { type: 'directory' });
  assert.deepEqual(directoryBrowseRoute('/businesses/promotions'), { type: 'promotions' });
  for (const path of ['/', '/businesses/view/shared', '/businesses/view/%', '/businesses/private']) {
    assert.equal(directoryBrowseRoute(path), null, path);
  }
});

test('Niaz navigation retains city/category/service and can stay in the mounted app', () => {
  const target = new EventTarget();
  target.CustomEvent = CustomEvent;
  target.location = { assign: () => assert.fail('A handled navigation must not reload the app') };
  target.addEventListener('community-connect-open-directory', event => {
    event.preventDefault();
    const url = new URL(event.detail.href, 'https://example.test');
    assert.equal(url.pathname, '/businesses');
    assert.equal(url.searchParams.get('city'), 'melbourne');
    assert.equal(url.searchParams.get('category'), 'Food & Catering');
    assert.equal(url.searchParams.get('service'), 'Niaz Preparation and supply');
  });
  openDirectory({ city: 'melbourne', category: 'Food & Catering', service: 'Niaz Preparation and supply' }, target);
});

test('cards outside the app retain a reloadable Directory link fallback', () => {
  const target = new EventTarget();
  target.CustomEvent = CustomEvent;
  let href;
  target.location = { assign: value => { href = value; } };
  openDirectory({ city: 'perth', search: 'catering & meals' }, target);
  const url = new URL(href, 'https://example.test');
  assert.equal(url.pathname, '/businesses');
  assert.equal(url.searchParams.get('city'), 'perth');
  assert.equal(url.searchParams.get('q'), 'catering & meals');
});
