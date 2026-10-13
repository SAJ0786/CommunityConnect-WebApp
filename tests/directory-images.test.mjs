import test from 'node:test';
import assert from 'node:assert/strict';
import { createDirectoryImageService, validateBusinessImage, inspectBusinessImage, BUSINESS_IMAGE_LIMIT } from '../src/services/directory/images.mjs';
import { createDirectoryGateway } from '../src/services/directory/gateway.mjs';
import { recordingFirestore } from './firebase-integration/recordingFirestore.mjs';
import { identities, seedRecords } from './firebase-integration/fixtures.mjs';
const png = () => new Blob([Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,0])], { type: 'image/png' });
function setup(options = {}) {
  const transport = recordingFirestore(seedRecords());
  const objects = new Map(), removed = [], uploads = [];
  let sequence = 0;
  const sdk = { ref: (_, path) => path,
    async uploadBytes(path, file) { uploads.push(path); objects.set(path, file); await options.afterUpload?.(path); },
    async getDownloadURL(path) { return `http://127.0.0.1:9198/image/${encodeURIComponent(path)}`; },
    async deleteObject(path) { removed.push(path); objects.delete(path); },
  };
  const images = createDirectoryImageService({ bucket: {}, uid: 'review-member', sdk, newId: () => `test-${++sequence}` });
  const gateway = createDirectoryGateway({ db: {}, user: identities[options.identity || 'member'], sdk: transport.sdk, images });
  return { ...transport, objects, removed, uploads, sdk, images, gateway };
}
test('image validation rejects empty/oversize/unsupported files and mismatched signatures', async () => {
  for (const file of [{ type: 'image/png', size: 0 }, { type: 'image/png', size: BUSINESS_IMAGE_LIMIT }, { type: 'image/svg+xml', size: 100 }]) assert.throws(() => validateBusinessImage(file));
  assert.doesNotThrow(() => validateBusinessImage({ type: 'image/png', size: BUSINESS_IMAGE_LIMIT - 1 }));
  await assert.rejects(inspectBusinessImage(new Blob(['not an image'], { type: 'image/png' })), /contents/);
  await inspectBusinessImage(png());
  await inspectBusinessImage(new Blob([Uint8Array.from([255,216,255,0])], { type: 'image/jpeg' }));
  await inspectBusinessImage(new Blob(['RIFF1234WEBP'], { type: 'image/webp' }));
});
test('upload generates an owner path and discards only its own uncommitted objects', async () => {
  const { images, objects, removed } = setup();
  const image = await images.upload(png(), 'logo');
  assert.equal(image.imagePath, 'business-images/review-member/logo-test-1.png');
  await images.discard('business-images/another-user/old.png');
  assert.equal(removed.length, 0);
  images.retain(image.imagePath);
  await images.discard(image.imagePath);
  assert.equal(objects.size, 1);
  const temporary = await images.upload(png(), 'cover');
  await images.discard(temporary.imagePath);
  assert.equal(objects.size, 1);
});
test('URL retrieval failure cleans only the newly uploaded object', async () => {
  const { images, sdk, objects, removed } = setup();
  sdk.getDownloadURL = async () => { throw new Error('Storage disconnected'); };
  await assert.rejects(images.upload(png(), 'logo'), /disconnected/);
  assert.equal(objects.size, 0); assert.equal(removed.length, 1);
});
test('listing replacement saves uploaded paths while retaining the public image pending review', async () => {
  const { gateway, records, removed } = setup();
  const old = { ...records.get('businesses/example'), logoUrl: 'https://example.test/old.png', logoPath: 'business-images/review-member/old.png' };
  records.set('businesses/example', old);
  const projection = structuredClone(records.get('publicBusinesses/example'));
  await gateway.action('business.save', { ...old, id: 'example', logoFile: png() });
  const saved = records.get('businesses/example');
  assert.equal(saved.logoPath, 'business-images/review-member/logo-test-1.png');
  assert.equal(saved.logoFile, undefined);
  assert.equal(saved.publishedSnapshot.logoUrl, old.logoUrl);
  assert.deepEqual(records.get('publicBusinesses/example'), projection);
  assert.equal(removed.length, 0);
});
test('invalid later file and forbidden owner both fail before any upload', async () => {
  const { gateway, records, uploads } = setup();
  await assert.rejects(gateway.action('business.save', { ...records.get('businesses/example'), id: 'example', logoFile: png(), coverFile: new Blob(['bad'], { type: 'image/png' }) }));
  await assert.rejects(gateway.action('business.save', { ...records.get('businesses/melbourne'), id: 'melbourne', logoFile: png() }));
  assert.equal(uploads.length, 0);
});
test('second upload failure removes prepared objects and writes no listing', async () => {
  const state = setup({ afterUpload: async path => { if (path.includes('cover')) throw new Error('Offline'); } });
  await assert.rejects(state.gateway.action('business.save', { ...state.records.get('businesses/example'), id: 'example', logoFile: png(), coverFile: png() }), /Offline/);
  assert.equal(state.objects.size, 0); assert.equal(state.writes.length, 0);
});
test('account deactivation or closure during upload stops the later database save', async () => {
  for (const close of [false, true]) {
    const state = setup({ afterUpload: async () => {
      if (close) state.gateway.close();
      else state.records.set('users/review-member', { ...state.records.get('users/review-member'), isActive: false });
    } });
    await assert.rejects(state.gateway.action('business.save', { ...state.records.get('businesses/example'), id: 'example', logoFile: png() }));
    assert.equal(state.objects.size, 0); assert.equal(state.writes.length, 0);
  }
});
test('unconfirmed database commit retains uploaded images instead of deleting possibly saved references', async () => {
  const state = setup();
  // The Firestore batch contract is replaced before constructing this gateway.
  const database = { ...recordingFirestore(seedRecords()).sdk, writeBatch: () => ({ update() {}, delete() {}, commit: async () => { throw new Error('Commit outcome unknown'); } }) };
  const gateway = createDirectoryGateway({ db: {}, user: identities.member, sdk: database, images: state.images });
  await assert.rejects(gateway.action('business.save', { ...state.records.get('businesses/example'), id: 'example', logoFile: png() }), /unknown/);
  assert.equal(state.objects.size, 1); assert.equal(state.removed.length, 0);
});
test('promotion resubmission preserves trusted image paths, replacement and explicit removal', async () => {
  const state = setup();
  const entry = [...state.records.entries()].find(([path, row]) => path.startsWith('businessPromotions/') && row.ownerId === 'review-member');
  assert.ok(entry);
  const [path, row] = entry, id = path.split('/')[1];
  state.records.set(path, { ...row, imageUrl: 'https://example.test/promo.png', imagePath: 'business-images/review-member/promo.png' });
  await state.gateway.action('promotion.save', { ...state.records.get(path), id, imagePath: 'forged' });
  assert.equal(state.records.get(path).imagePath, 'business-images/review-member/promo.png');
  await state.gateway.action('promotion.save', { ...state.records.get(path), id, imageFile: png() });
  assert.equal(state.records.get(path).imagePath, 'business-images/review-member/promotion-test-1.png');
  await state.gateway.action('promotion.save', { ...state.records.get(path), id, imageUrl: '' });
  assert.equal(state.records.get(path).imagePath, '');
  assert.equal(state.removed.length, 0);
});
