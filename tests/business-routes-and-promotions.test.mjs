import test from 'node:test';
import assert from 'node:assert/strict';
import { publicBusinessRoute, businessPath, businessShareUrl, directoryQuery } from '../src/utils/businessRoutes.mjs';
import { toPublicPromotion, promotionIsActive, activePublicPromotions } from '../src/utils/publicPromotions.mjs';
import { toPublicBusiness } from '../src/utils/publicBusinesses.mjs';

test('public routes preserve Events, calendar, download and backend paths', () => {
  for (const path of ['/', '/event/123', '/cal', '/unsubscribe.html', '/download', '/app', '/businesses-other']) assert.equal(publicBusinessRoute(path), null);
  assert.deepEqual(publicBusinessRoute('/businesses/'), { type: 'directory' });
  assert.deepEqual(publicBusinessRoute('/businesses/promotions'), { type: 'promotions' });
  const id = 'A name & Unicode café';
  assert.deepEqual(publicBusinessRoute(businessPath(id)), { type: 'business', id });
  for (const path of ['/businesses/view/%', '/businesses/view/a%2Fb', '/businesses/view/%00', '/businesses/view/..', '/businesses/unknown']) assert.deepEqual(publicBusinessRoute(path), { type: 'missing' });
  assert.equal(businessShareUrl('example', 'https://communityconnect.siza.info'), 'https://communityconnect.siza.info/businesses/view/example');
  const params = new URLSearchParams(directoryQuery({ city: 'melbourne', search: 'food & tea', category: 'Food' }));
  assert.equal(params.get('q'), 'food & tea');
});

const source = { businessId: 'one', title: 'Example offer', status: 'active', startDate: '2026-10-01', endDate: '2026-10-02', fullDetails: 'Offer conditions.', ownerId: 'private', imagePath: 'private/path', rejectionReason: 'private', imageUrl: 'javascript:alert(1)' };
test('promotion projection discards private data and unsafe media URLs', () => {
  const result = toPublicPromotion('offer', source);
  assert.equal(result.imageUrl, '');
  for (const key of ['ownerId', 'imagePath', 'rejectionReason']) assert.equal(key in result, false);
  for (const extra of [{ status: 'pending' }, { status: 'rejected' }, { hidden: true }, { title: '' }, { businessId: '' }, { startDate: { seconds: 123 } }]) assert.equal(toPublicPromotion('offer', { ...source, ...extra }), null);
});

test('promotions respect inclusive UTC dates, midnight expiry, hidden state and malformed dates', () => {
  assert.equal(promotionIsActive(source, '2026-10-01'), true);
  assert.equal(promotionIsActive(source, '2026-10-02'), true);
  assert.equal(promotionIsActive(source, '2026-09-30'), false);
  assert.equal(promotionIsActive(source, '2026-10-03'), false);
  assert.equal(promotionIsActive({ ...source, startDate: '', endDate: '' }, '2026-10-03'), true);
  for (const extra of [{ hidden: true }, { status: 'pending' }, { startDate: '2026-02-30' }, { endDate: 'invalid' }, { startDate: '2026-10-04' }]) assert.equal(promotionIsActive({ ...source, ...extra }, '2026-10-02'), false);
});

test('public offers join only visible parents, stay in city, sort sponsored then newest, and vanish with parent', () => {
  const businesses = [{ id: 'one', city: 'sydney' }, { id: 'two', city: 'melbourne' }];
  const offer = (id, extra = {}) => toPublicPromotion(id, { ...source, ...extra });
  const promotions = [offer('old'), offer('new', { updatedAt: { seconds: 100 } }), offer('sponsored', { boosted: true }), offer('other-city', { businessId: 'two' }), offer('orphan', { businessId: 'private' })];
  assert.deepEqual(activePublicPromotions(promotions, businesses, { city: 'sydney', today: '2026-10-02' }).map(p => p.id), ['sponsored', 'new', 'old']);
  assert.equal(activePublicPromotions(promotions, [], { today: '2026-10-02' }).length, 0);
  assert.equal(activePublicPromotions(promotions, businesses, { businessId: 'two', today: '2026-10-02' }).length, 1);
  assert.equal(activePublicPromotions(promotions, businesses, { today: '2026-10-03' }).length, 0);
});

test('detail links and media cannot expose a suburb-only street or executable URL', () => {
  const business = toPublicBusiness('one', { status: 'approved', name: 'Example', location: { publicDisplay: 'suburb', suburb: 'Parramatta', fullAddress: 'Hidden Street', latitude: -33 }, logoUrl: 'data:image/svg+xml,test', contact: { whatsapp: '+61 400 000 000' }, social: { instagram: 'javascript:alert(1)', facebook: 'https://example.com' } });
  assert.equal(business.address, 'Parramatta');
  assert.equal(business.whatsapp, '61400000000');
  assert.equal(business.logoUrl, '');
  assert.equal(business.social.instagram, '');
  assert.equal(JSON.stringify(business).includes('Hidden Street'), false);
});
