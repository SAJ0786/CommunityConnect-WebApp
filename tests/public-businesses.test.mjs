import test from 'node:test';
import assert from 'node:assert/strict';
import { toPublicBusiness, filterPublicBusinesses, safeWebsite, formatHours } from '../src/utils/publicBusinesses.mjs';
import { businessDiscovery, timestampMillis } from '../src/utils/businessDiscovery.mjs';

const sample = {
  name: 'Example catering', status: 'approved', hidden: false,
  category: 'Food & Catering', categories: ['Food & Catering'], subcategories: ['Party trays'],
  location: { city: 'sydney', suburb: 'Parramatta', state: 'NSW', postcode: '2150', publicDisplay: 'suburb', fullAddress: 'Private street address' },
  contact: { phone: '+61 400 000 000', email: 'hello@example.com', website: 'example.com' },
  ownerId: 'private-owner', referrer: { phone: 'private' }, abn: 'private', moderationNotes: 'private',
};

test('discovery projection preserves public coordinates but rounds suburb-only locations', () => {
  const data = {...sample, location:{...sample.location,latitude:-33.81234,longitude:150.98765},firstPublishedAt:{seconds:1791504000},createdAt:{seconds:1791590400}};
  const publicRow = toPublicBusiness('one',data);
  assert.deepEqual(publicRow.coordinates,{latitude:-33.81,longitude:150.99});
  assert.equal(publicRow.locationApproximate,true);
  assert.equal(publicRow.publishedAtMillis,1791504000000);
  assert.deepEqual(toPublicBusiness('one',{...data,location:{...data.location,publicDisplay:'full'}}).coordinates,{latitude:-33.81234,longitude:150.98765});
  for (const latitude of [null,'', '  ',true,undefined,91,'invalid']) assert.equal(toPublicBusiness('one',{...data,location:{...data.location,latitude}}).coordinates,null);
  assert.equal(publicRow.updatedAt,undefined);
});

test('nearby discovery ranks only known locations within the already filtered city', () => {
  const rows = [
    {...toPublicBusiness('far',sample),coordinates:{latitude:-33.9,longitude:151}},
    {...toPublicBusiness('near',sample),coordinates:{latitude:-33.8,longitude:151}},
    {...toPublicBusiness('missing',sample),coordinates:null},
    {...toPublicBusiness('other',sample),city:'melbourne',coordinates:{latitude:-33.8,longitude:151}},
  ];
  const result = businessDiscovery(filterPublicBusinesses(rows,{city:'sydney'}),{filter:'near',location:{latitude:-33.8,longitude:151}});
  assert.deepEqual(result.map(row=>row.id),['near','far']);
  assert.equal(result[0].distanceKm,0);
  assert.equal(rows[0].distanceKm,undefined);
  assert.deepEqual(businessDiscovery(rows,{filter:'near',location:null}),[]);
});

test('recent businesses use the original publication date and the inclusive 30-day window', () => {
  const now = Date.parse('2026-10-10T00:00:00Z');
  const row = (id,time) => ({id,name:id,publishedAtMillis:time});
  const rows = [row('old',now-31*86400000),row('boundary',now-30*86400000),row('missing',null),row('future',now+1),row('new',now)];
  assert.deepEqual(businessDiscovery(rows,{filter:'recent',now}).map(row=>row.id),['new','boundary']);
  const original = toPublicBusiness('one',{...sample,firstPublishedAt:{toMillis:()=>now-31*86400000},approvedAt:{toMillis:()=>now},updatedAt:{toMillis:()=>now}});
  assert.deepEqual(businessDiscovery([original],{filter:'recent',now}),[]);
  assert.equal(toPublicBusiness('legacy',{...sample,approvedAt:'2026-10-10T00:00:00Z'}).publishedAtMillis,now);
  assert.equal(timestampMillis('invalid'),null);
});

test('only approved visible businesses are admitted', () => {
  for (const status of ['pending', 'archived', 'deleted', 'rejected', undefined]) {
    assert.equal(toPublicBusiness('one', { ...sample, status }), null);
  }
  assert.equal(toPublicBusiness('one', { ...sample, hidden: true }), null);
  assert.equal(toPublicBusiness('one', { ...sample, name: '' }), null);
  assert.ok(toPublicBusiness('one', sample));
});
test('projection excludes private fields and exact suburb-only addresses', () => {
  const result = toPublicBusiness('one', sample);
  assert.equal(result.address, 'Parramatta NSW 2150');
  assert.equal(result.phone, '+61400000000');
  for (const key of ['ownerId', 'referrer', 'abn', 'moderationNotes', 'location']) assert.equal(key in result, false);
  assert.equal(JSON.stringify(result).includes('Private street'), false);
  assert.equal(toPublicBusiness('one', { ...sample, location: { ...sample.location, publicDisplay: 'full' } }).address, 'Private street address');
});
test('web links reject executable schemes and embedded credentials', () => {
  for (const value of ['javascript:alert(1)', 'data:text/html,hi', 'file:///C:/test', 'https://name:password@example.com']) assert.equal(safeWebsite(value), '');
  assert.equal(safeWebsite('example.com'), 'https://example.com/');
});
test('search and categories stay within the selected city', () => {
  const a = toPublicBusiness('one', sample);
  const b = toPublicBusiness('two', { ...sample, location: { ...sample.location, city: 'melbourne' } });
  assert.equal(filterPublicBusinesses([a, b], { city: 'sydney', search: 'PARTY' }).length, 1);
  assert.equal(filterPublicBusinesses([a, b], { city: 'perth' }).length, 0);
  assert.equal(filterPublicBusinesses([a, b], { city: 'sydney', category: 'Retail' }).length, 0);
  assert.equal(toPublicBusiness('three', { ...sample, location: {} }).city, 'rest-of-australia');
});
test('hours support legacy, split, overnight, closed and 24-hour records', () => {
  assert.equal(formatHours({ open: '09:00', close: '17:00' }), '09:00–17:00');
  assert.equal(formatHours({ periods: [{ open: '09:00', close: '12:00' }, { open: '14:00', close: '18:00' }] }), '09:00–12:00, 14:00–18:00');
  assert.equal(formatHours({ periods: [{ open: '22:00', close: '02:00' }] }), '22:00–02:00 (next day)');
  assert.equal(formatHours({ open24Hours: true }), 'Open 24 hours');
  assert.equal(formatHours({ closed: true, open24Hours: true }), 'Closed');
  assert.equal(formatHours({ open: 'bad', close: 'data' }), 'Not supplied');
});
