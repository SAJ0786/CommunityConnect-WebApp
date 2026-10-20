import { toPublicBusiness } from '../../src/utils/publicBusinesses.mjs';
import { toPublicPromotion } from '../../src/utils/publicPromotions.mjs';
export const auth = { currentUser: null };
export const firebaseConfigured = true;
export const onAuthStateChanged = (_, next) => {
  let active = true;
  queueMicrotask(() => { if (active) next(null); });
  return () => { active = false; };
};
export const useCityCatalogueRefresh = () => 0;
const day = offset => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
const raw = { status: 'approved', name: 'Example Community Catering', description: 'Fresh meals and catering for community gatherings. This is a synthetic business for local review.', categories: ['Food & Catering'], subcategories: ['Event catering', 'Family meals'], location: { city: 'sydney', suburb: 'Parramatta', state: 'NSW', postcode: '2150', publicDisplay: 'suburb', fullAddress: 'PRIVATE STREET NEVER PUBLIC' }, hours: { mon: { open: '09:00', close: '17:00' }, tue: { periods: [{ open: '09:00', close: '12:00' }, { open: '14:00', close: '18:00' }] }, fri: { open: '22:00', close: '02:00' }, sat: { open24Hours: true }, sun: { closed: true } }, contact: { phone: '+61400000000', email: 'hello@example.test', website: 'https://example.test', whatsapp: '+61400000000' }, abnVerified: true };
const rawOffers = [
  ['offer', { title: 'Community catering special', briefText: 'A seasonal offer for community gatherings.', discountText: '15% off orders over $150', fullDetails: 'Mention COMMUNITY when contacting the business. Orders must be confirmed during the offer period. Subject to availability.', boosted: true }],
  ['second', { title: 'Family meal offer', briefText: 'A second current offer with full conditions.', fullDetails: 'Available for collection only. Contact the business to order.' }],
  ['expired', { title: 'EXPIRED OFFER', endDate: day(-1) }],
  ['future', { title: 'FUTURE OFFER', startDate: day(1) }],
  ['hidden', { title: 'HIDDEN OFFER', hidden: true }],
  ['pending', { title: 'PENDING OFFER', status: 'pending' }],
  ['orphan', { title: 'ORPHAN OFFER', businessId: 'unpublished' }],
  ['melbourne', { title: 'Melbourne workshop offer', businessId: 'melbourne' }],
].map(([id, extra]) => toPublicPromotion(id, { businessId: 'example', status: 'active', startDate: day(-1), endDate: day(1), ...extra })).filter(Boolean);

function listen(kind, onData, onError) {
  const emit = () => {
    const state = sessionStorage.getItem('public-fixture-state') || 'ready';
    if (state === 'loading') return;
    if (state === `${kind}-error` || state === 'error') return onError(new Error('Synthetic error'));
    let businesses = [toPublicBusiness('example', raw), toPublicBusiness('melbourne', { ...raw, name: 'Example Melbourne Workshop', categories: ['Home & Services'], location: { ...raw.location, city: 'melbourne', suburb: 'Coburg', state: 'VIC' } })];
    if (state === 'removed') businesses = businesses.filter(b => b.id !== 'example');
    if (state === 'images') businesses[0] = { ...businesses[0], logoUrl: `${location.origin}/missing-logo.png`, coverUrl: `${location.origin}/missing-cover.png` };
    onData({ [kind]: state === 'empty' ? [] : kind === 'businesses' ? businesses : rawOffers, fromCache: state === 'cached' });
  };
  const timer = setTimeout(emit, 40);
  window.addEventListener('public-fixture-update', emit);
  return () => { clearTimeout(timer); window.removeEventListener('public-fixture-update', emit); };
}
export const listenPublicBusinesses = (onData, onError) => listen('businesses', onData, onError);
export const listenPublicPromotions = (onData, onError) => listen('promotions', onData, onError);
