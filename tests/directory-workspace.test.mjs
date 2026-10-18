import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { emptyListing, listingErrors, listingSubmission, promotionErrors, promotionSubmission, published, scopedBusinesses, aggregateStatistics } from '../src/business/workspaceModel.mjs';
import { validateBusinessHours } from '../src/business/businessHours.mjs';
import { freshData, applyDemoAction } from './workspace-preview/model.mjs';
const member = { uid: 'review-member', role: 'user', defaultCity: 'sydney' };
const admin = { ...member, role: 'superAdmin' };

test('native hours helpers and category catalogue are reused without altering their source', () => {
  assert.equal(fs.readFileSync('src/business/businessHours.mjs','utf8').replaceAll('\r',''), fs.readFileSync('../sdk51-package-backup/src/utils/businessHours.js','utf8').replaceAll('\r',''));
  const native = fs.readFileSync('../sdk51-package-backup/src/business/businessData.js','utf8').split('export const SAMPLE_BUSINESSES')[0].replace(/^import \{ colors \} from '\.\.\/theme';\r?\n/, '').trim();
  assert.equal(fs.readFileSync('src/business/categories.mjs','utf8').trim(),native);
});
test('listing form requires reference consent, declaration, selected address and valid schedules', () => {
  const form = emptyListing(freshData().businesses[0]);
  assert.ok(listingErrors(form).referrer);
  assert.ok(listingErrors(form).declaration);
  form.referrer.consentConfirmed = true; form.listingDeclarationAccepted = true;
  assert.deepEqual(listingErrors(form),{});
  assert.ok(listingErrors({ ...form, location: { ...form.location, latitude: null } }).location);
  assert.ok(validateBusinessHours({ mon: { periods: [{ open: '09:00', close: '12:00' }, { open: '11:00', close: '13:00' }] } }));
});
test('promotion UI requires conditions, a declaration and valid inclusive dates', () => {
  const form = { ...freshData().promotions[0], declaration: true };
  assert.deepEqual(promotionErrors(form),{});
  assert.ok(promotionErrors({ ...form, endDate: '2026-02-30' }).dates);
  assert.ok(promotionErrors({ ...form, fullDetails: '' }).fullDetails);
  assert.ok(promotionErrors({ ...form, declaration: false }).declaration);
});
test('city-scoped statistics exclude nonpublic and historical businesses', () => {
  const data = freshData();
  const scoped = scopedBusinesses(data.businesses, { ...member, role: 'admin', adminCity: 'sydney' });
  assert.equal(scoped.some(row => row.location.city === 'melbourne'),false);
  assert.equal(aggregateStatistics(scoped,data.statistics).pageViews,410);
  assert.equal(published({ status: 'archived', hasPublishedVersion: true }),false);
});
test('forms exclude owner, moderation, authority and timestamp fields from submissions', () => {
  const data = freshData();
  const business = listingSubmission(emptyListing({ ...data.businesses[0], abnStatus: 'none', abn: '51824753556', approvedAt: 'private' }));
  for (const key of ['ownerId','status','approvedAt','id','hidden']) assert.equal(key in business,false);
  assert.equal(business.abn,'');
  const offer = promotionSubmission({ ...data.promotions[0], boosted: true, approvedAt: 'private' });
  for (const key of ['ownerId','status','boosted','approvedAt','id','hidden']) assert.equal(key in offer,false);
});
test('synthetic edit preserves public version until approval and archive retains history', () => {
  let data = freshData();
  data = applyDemoAction(data,'business.save',{ ...data.businesses[0], description: 'Proposed update' },member).next;
  assert.equal(data.businesses.find(row => row.id === 'example').status,'pending');
  assert.notEqual(data.publicBusinesses.find(row => row.id === 'example').description,'Proposed update');
  data = applyDemoAction(data,'business.approve',{ id: 'example', referrerConfirmed: true, publishWithoutAbn: true, tier: 'free' },admin).next;
  assert.equal(data.publicBusinesses.find(row => row.id === 'example').description,'Proposed update');
  data = applyDemoAction(data,'business.archive',{ id: 'example' },admin).next;
  assert.equal(data.publicBusinesses.some(row => row.id === 'example'),false);
  assert.equal(data.publicPromotions.some(row => row.businessId === 'example'),false);
  assert.equal(data.businesses.find(row => row.id === 'example').status,'archived');
  data = applyDemoAction(data,'business.restore',{ id: 'example' },admin).next;
  assert.equal(data.businesses.find(row => row.id === 'example').status,'pending');
  assert.equal(data.publicBusinesses.some(row => row.id === 'example'),false);
});
test('synthetic notification clear retains moderation and blocked threads reject replies', () => {
  let data = freshData();
  data = applyDemoAction(data,'notifications.clear',{},member).next;
  assert.deepEqual(data.notifications.map(row => row.id),['moderation']);
  data = applyDemoAction(data,'thread.block',{ id: 'thread', blocked: true },member).next;
  assert.throws(() => applyDemoAction(data,'thread.reply',{ id: 'thread', text: 'hello' },member),/blocked/);
  assert.throws(() => applyDemoAction(data,'business.archive',{ id: 'example' },member),/Administrator/);
});
