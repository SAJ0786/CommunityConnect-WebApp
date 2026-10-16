import test from 'node:test';
import assert from 'node:assert/strict';
import { suggestCityCode } from '../src/utils/airportCodes.mjs';
import { createCityManagement } from '../src/utils/cityManagement.mjs';

test('airport codes are suggested by city and state, and absent for unknown towns', () => {
  assert.equal(suggestCityCode({ label: 'Newcastle, NSW, Australia', state: 'NSW' }), 'NTL');
  assert.equal(suggestCityCode({ label: 'Devonport, TAS, Australia', state: 'TAS' }), 'DPO');
  assert.equal(suggestCityCode({ label: 'Newcastle, NSW, Australia', state: 'QLD' }), '');
  assert.equal(suggestCityCode({ label: 'Tinyville, VIC, Australia', state: 'VIC' }), '');
});

test('city updates validate codes before calling the backend', async () => {
  const calls = [];
  const api = createCityManagement(async (name, data) => { calls.push([name, data]); return { data: {} }; }, { enabled: true });
  assert.throws(() => api.update('darwin-nt', { code: 'x' }), /2-6/);
  await api.update('darwin-nt', { enabled: false });
  await api.update('darwin-nt', { code: 'DRW' });
  assert.deepEqual(calls, [['updateCatalogueCity', { cityId: 'darwin-nt', enabled: false }], ['updateCatalogueCity', { cityId: 'darwin-nt', code: 'DRW' }]]);
});
