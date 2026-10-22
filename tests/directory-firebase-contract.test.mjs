import test from 'node:test';
import assert from 'node:assert/strict';
import { createDirectoryGateway } from '../src/services/directory/gateway.mjs';
import { assertDirectoryTestEnvironment } from '../src/services/directory/policy.mjs';
import { recordingFirestore } from './firebase-integration/recordingFirestore.mjs';
import { identities, seedRecords } from './firebase-integration/fixtures.mjs';
import { listingSubmission } from '../src/business/workspaceModel.mjs';
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
function setup(identity = 'member', options = {}) {
  const transport = recordingFirestore(seedRecords());
  const saved = new Map();
  const gateway = createDirectoryGateway({ db: {}, user: identities[identity], sdk: transport.sdk, ...options,
    storage: { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value) } });
  return { ...transport, gateway, saved };
}

test('business ownership transfer uses the callable and does not write ownership from the web client',async()=>{
 const calls=[];
 const f=setup('admin',{callFunction:async(name,payload)=>{calls.push({name,payload});return {businessId:'example',ownerId:'review-customer'};}});
 const ownerId=f.records.get('businesses/example').ownerId;
 await f.gateway.action('business.transfer',{id:'example',toUid:'review-customer',expectedOwnerId:ownerId,confirmation:'TRANSFER BUSINESS',ownerEmail:'forged'});
 assert.deepEqual(calls,[{name:'transferBusinessOwnership',payload:{businessId:'example',toUid:'review-customer',expectedOwnerId:ownerId,confirmation:'TRANSFER BUSINESS'}}]);
 assert.equal(f.writes.length,0);
 await assert.rejects(setup('member').gateway.action('business.transfer',{id:'example'}),/Administrator/);
 await assert.rejects(f.gateway.action('business.transfer',{id:'melbourne'}),/city/);
});
test('isolated boundary rejects production projects, remote hosts and unexpected endpoints', () => {
  const settings = { projectId: 'demo-community-connect-web', hostname: 'localhost', host: '127.0.0.1', port: 8089 };
  assert.doesNotThrow(() => assertDirectoryTestEnvironment(settings));
  for (const change of [{ projectId: 'community-event-8b639' }, { hostname: 'communityconnect.siza.info' }, { host: 'firestore.googleapis.com' }, { port: 8080 }]) {
    assert.throws(() => assertDirectoryTestEnvironment({ ...settings, ...change }), /isolated/);
  }
});
test('saved changes use account array transforms, including removal of withdrawn listings', async () => {
  const { gateway, writes, records } = setup();
  await gateway.action('saved.add', { id: 'melbourne' });
  assert.deepEqual(records.get('users/review-member').savedBusinesses, ['example', 'melbourne']);
  records.delete('publicBusinesses/example');
  await gateway.action('saved.remove', { id: 'example' });
  assert.deepEqual(records.get('users/review-member').savedBusinesses, ['melbourne']);
  assert.equal(writes[0].path, 'users/review-member');
});
test('inactive and closed sessions reject actions before any write', async () => {
  for (const identity of ['inactive', 'member']) {
    const { gateway, writes } = setup(identity);
    if (identity === 'member') gateway.close();
    await assert.rejects(gateway.action('saved.add', { id: 'example' }));
    assert.equal(writes.length, 0);
  }
});
test('listing submission persists terms and strips forged authority fields', async () => {
  const { gateway, records } = setup();
  const form = { ...records.get('businesses/pending'), ownerId: 'attacker', role: 'superAdmin', status: 'approved' };
  const payload = listingSubmission(form);
  const { id } = await gateway.action('business.save', { ...payload, ownerId: 'attacker', status: 'approved' });
  const record = records.get(`businesses/${id}`);
  assert.equal(record.ownerId, 'review-member'); assert.equal(record.status, 'pending');
  assert.equal(record.listingTermsVersion, '2026-09-08-community-connect');
  assert.ok(Date.parse(record.listingConsentAtClient));
  assert.equal(record.abnVerified, false);
  assert.equal(record.role, undefined);
});
test('owner edits preserve public listing and private published snapshot pending review', async () => {
  const { gateway, records } = setup();
  const published = structuredClone(records.get('publicBusinesses/example'));
  await gateway.action('business.save', { ...records.get('businesses/example'), id: 'example', name: 'Changed listing name' });
  assert.deepEqual(records.get('publicBusinesses/example'), published);
  const proposed = records.get('businesses/example');
  assert.equal(proposed.status, 'pending'); assert.equal(proposed.hasPublishedVersion, true);
  assert.equal(proposed.publishedSnapshot.name, published.name);
});
test('owners cannot edit another listing or archived records', async () => {
  const { gateway, records, writes } = setup();
  for (const id of ['melbourne', 'archive']) await assert.rejects(gateway.action('business.save', { ...records.get(`businesses/${id}`), id }));
  assert.equal(writes.length, 0);
});
test('resubmitting unchanged images preserves storage paths without accepting supplied paths', async () => {
  const { gateway, records } = setup();
  const original = { ...records.get('businesses/example'), logoUrl: 'https://example.test/logo.png', logoPath: 'business-images/review-member/logo.png' };
  records.set('businesses/example', original);
  await gateway.action('business.save', { ...original, id: 'example', logoPath: 'business-images/other/forged.png' });
  assert.equal(records.get('businesses/example').logoPath, original.logoPath);
});
test('city admin cross-city decisions and member review attempts are refused before writes', async () => {
  for (const identity of ['member', 'admin']) {
    const { gateway, writes } = setup(identity);
    await assert.rejects(gateway.action('business.approve', { id: identity === 'member' ? 'pending' : 'melbourne', referrerConfirmed: true, publishWithoutAbn: true }));
    assert.equal(writes.length, 0);
  }
});
test('no-ABN approval writes sanitised projection, routing and audit together', async () => {
  const { gateway, records, writes } = setup('admin');
  await gateway.action('business.approve', { id: 'pending', referrerConfirmed: true, publishWithoutAbn: true, historyReviewed: true });
  const publicRow = records.get('publicBusinesses/pending');
  assert.equal(publicRow.status, 'approved'); assert.equal(publicRow.ownerId, undefined);
  assert.equal(publicRow.referrer, undefined); assert.equal(publicRow.abn, undefined);
  assert.equal(publicRow.location.fullAddress, 'Parramatta NSW 2150');
  assert.equal(records.get('businessContactRoutes/pending').ownerUid, 'review-member');
  assert.ok(writes.some(row => row.path.startsWith('businessAudit/')));
});
test('promotion edit withdraws its projection; archive retains private history', async () => {
  const { gateway, records } = setup();
  records.set('publicBusinessPromotions/offer', { title: 'Old published offer' });
  await gateway.action('promotion.save', { ...records.get('businessPromotions/offer'), id: 'offer', title: 'Updated promotion' });
  assert.equal(records.get('businessPromotions/offer').status, 'pending');
  assert.equal(records.has('publicBusinessPromotions/offer'), false);
  await gateway.action('promotion.archive', { id: 'offer' });
  assert.equal(records.get('businessPromotions/offer').status, 'archived');
  await assert.rejects(gateway.action('promotion.save', { ...records.get('businessPromotions/offer'), id: 'offer' }), /Historical/);
});
test('replies use native subcollection and unread fields; blocks deny sends', async () => {
  const { gateway, records, writes } = setup();
  await gateway.action('thread.reply', { id: 'thread', text: 'Test reply' });
  const message = writes.find(row => row.path.startsWith('businessMessageThreads/thread/messages/'));
  assert.equal(message.value.senderUid, 'review-member'); assert.equal(message.value.text, 'Test reply');
  assert.equal(records.get('businessMessageThreads/thread').unreadBy['review-customer'], 1);
  await gateway.action('thread.block', { id: 'thread', blocked: true });
  await assert.rejects(gateway.action('thread.reply', { id: 'thread', text: 'Blocked reply' }), /blocked/);
  await gateway.action('thread.block', { id: 'thread', blocked: false });
  await assert.rejects(gateway.action('thread.reply', { id: 'thread', text: 'x'.repeat(2001) }), /2000/);
});
test('administration role grants no access to private conversations or notifications', async () => {
  const { gateway, writes } = setup('super');
  await assert.rejects(gateway.action('thread.reply', { id: 'thread', text: 'Forbidden' }), /not available/);
  await assert.rejects(gateway.action('notification.read', { id: 'notice' }), /another account/);
  assert.equal(writes.length, 0);
});
test('clearing notifications marks own updates read without deleting server history', async () => {
  const { gateway, records, saved, writes } = setup();
  records.set('userNotifications/other', { recipientUid: 'review-customer', read: false });
  records.set('businessModerationNotices/mod', { ownerUid: 'review-member' });
  await gateway.action('notifications.clear');
  assert.equal(records.get('userNotifications/notice').read, true);
  assert.equal(records.get('userNotifications/other').read, false);
  assert.ok(records.has('businessModerationNotices/mod'));
  assert.deepEqual(JSON.parse([...saved.values()][0]), ['notice']);
  assert.ok(writes.every(row => row.kind !== 'delete'));
});
test('feeds scope queries, invalidate changed permissions and stop all listeners', async () => {
  const { gateway, records, listeners, emit } = setup(); const states = [];
  gateway.subscribe(state => states.push(state)); await tick(); await tick();
  assert.equal(states.at(-1).status, 'ready');
  assert.ok(states.at(-1).data.businesses.every(row => row.ownerId === 'review-member'));
  records.set('users/review-member', { ...records.get('users/review-member'), isActive: false }); emit(); await tick();
  assert.equal(states.at(-1).status, 'error'); assert.equal(states.at(-1).data.businesses.length, 0);
  assert.equal(listeners.size, 0);
  const count = states.length; gateway.close(); emit(); await tick(); assert.equal(states.length, count);
});
test('uploads and unintegrated callables fail explicitly without writing', async () => {
  const { gateway, writes, records } = setup();
  await assert.rejects(gateway.action('business.save', { ...records.get('businesses/pending'), logoFile: {} }), /Storage emulator/);
  await assert.rejects(gateway.action('support.submit', { requestId: 'support_contract_test', category: 'Other', senderName: 'Test member', senderEmail: 'member@example.test', message: 'Synthetic support check only.' }), /No changes were sent/);
  assert.equal(writes.length, 0);
});
test('account teardown during a pending listing read cancels its later commit', async () => {
  const { gateway, sdk, records, writes } = setup();
  const original = sdk.getDoc;
  // Recreate after installing the delayed transport so the native contract uses it.
  let release;
  const delayed = new Promise(resolve => { release = resolve; });
  sdk.getDoc = async ref => { if (ref.path === 'businesses/example') await delayed; return original(ref); };
  const current = createDirectoryGateway({ db: {}, user: identities.member, sdk });
  const action = current.action('business.save', { ...records.get('businesses/example'), id: 'example' });
  await tick(); current.close(); release();
  await assert.rejects(action, /session has ended/);
  assert.equal(writes.length, 0);
  gateway.close();
});
test('category transactions use the native settings schema and reject duplicates and members', async () => {
  const { gateway, records } = setup('admin');
  await gateway.action('category.add', { label: 'Arts & Crafts', icon: '🎨' });
  await gateway.action('category.addService', { categoryId: 'arts-and-crafts', label: 'Pottery' });
  const settings = records.get('settings/businessCategories');
  assert.equal(settings.customCategories[0].icon, '🎨');
  assert.equal(settings.customCategories[0].addedByUid, 'review-admin');
  assert.equal(settings.customSubcategories[0].categoryId, 'arts-and-crafts');
  await assert.rejects(gateway.action('category.add', { label: 'Arts and Crafts' }), /already exists/);
  await assert.rejects(setup().gateway.action('category.add', { label: 'Forbidden category' }), /Administrator/);
});
test('appeals retain a native notice and audit atomically and refuse repeat submissions', async () => {
  const { gateway, records, writes } = setup();
  records.set('businessModerationNotices/appeal', { ownerUid: 'review-member', businessId: 'example', reportId: 'report', appealStatus: 'not-submitted' });
  await gateway.action('notification.appeal', { id: 'appeal', reason: 'Please review this synthetic moderation decision.' });
  assert.equal(records.get('businessModerationNotices/appeal').appealStatus, 'submitted');
  const audits = writes.filter(row => row.path.startsWith('businessModerationAudit/'));
  assert.equal(audits.length, 1); assert.equal(audits[0].value.actorUid, 'review-member');
  await assert.rejects(gateway.action('notification.appeal', { id: 'appeal', reason: 'Retry the same synthetic moderation appeal.' }), /already been submitted/);
});
test('new enquiries send only the native callable contract and consume threadId', async () => {
  const calls = [];
  const { gateway } = setup('customer', { callFunction: async (name, payload) => { calls.push({ name, payload }); return { threadId: 'created-thread' }; } });
  const result = await gateway.action('thread.create', { businessId: 'example', text: 'A synthetic enquiry', senderName: 'Forged name', ownerUid: 'forged' });
  assert.equal(result.id, 'created-thread');
  assert.deepEqual(calls, [{ name: 'sendBusinessEnquiry', payload: { businessId: 'example', text: 'A synthetic enquiry', senderName: 'Test customer' } }]);
});
test('support retry preserves request ID and drops client-controlled routing and authority', async () => {
  const calls = [];
  const { gateway } = setup('member', { callFunction: async (name, payload) => { calls.push({ name, payload }); return { reference: 'receipt', status: 'queued' }; } });
  const input = { requestId: 'support_repeat_reference', businessId: 'example', category: 'Other', senderName: 'Test member', senderEmail: 'member@example.test', message: 'Synthetic business report for contract verification.', recipients: ['outside@example.test'], role: 'superAdmin', city: 'melbourne' };
  const first = await gateway.action('support.submit', input); await gateway.action('support.submit', input);
  assert.equal(first.reference, 'receipt');
  assert.equal(calls[0].name, 'submitSupportRequest');
  assert.deepEqual(calls[0].payload, calls[1].payload);
  assert.equal(calls[0].payload.kind, 'business-report');
  for (const key of ['recipients', 'role', 'city']) assert.equal(calls[0].payload[key], undefined);
});
test('conversation reports preserve the thread reference without exposing private messages', async () => {
  const calls = [];
  const { gateway } = setup('member', { callFunction: async (name, payload) => { calls.push({ name, payload }); return { reference: 'report-receipt', status: 'queued' }; } });
  await gateway.action('thread.report', { id: 'thread', requestId: 'support_thread_report', reason: 'Synthetic concern for local testing.' });
  assert.match(calls[0].payload.message, /Conversation ID: thread/);
  assert.doesNotMatch(calls[0].payload.message, /Sample enquiry/);
  assert.equal(calls[0].payload.category, 'Other');
});

test('connected conversation reports send only a reference and concern to the verified backend', async()=>{
  const calls=[];
  const {gateway}=setup('customer',{operationsEnabled:true,callFunction:async(name,payload)=>{calls.push({name,payload});return {reference:'receipt',status:'recorded'};}});
  const result=await gateway.action('thread.report',{id:'thread',requestId:'support_verified_report',reason:'A synthetic conduct concern.',city:'melbourne',senderUid:'review-super'});
  assert.deepEqual(calls,[{name:'submitDirectoryConversationReport',payload:{threadId:'thread',requestId:'support_verified_report',reason:'A synthetic conduct concern.'}}]);
  assert.match(result.receiptMessage,/recorded/);
});
test('member role changes are super-only and lifecycle changes use native callables', async () => {
  const calls = [];
  const { gateway, records } = setup('super', { callFunction: async (name, payload) => { calls.push({ name, payload }); return { archived: true }; } });
  await gateway.action('member.update', { id: 'review-customer', role: 'admin', isActive: true });
  assert.equal(records.get('users/review-customer').role, 'admin');
  await gateway.action('member.update', { id: 'review-customer', role: 'admin', isActive: false });
  assert.deepEqual(calls, [{ name: 'adminDeleteUser', payload: { targetUid: 'review-customer', ban: false } }]);
  await assert.rejects(gateway.action('member.update', { id: 'review-customer', role: 'user', isActive: false }), /separately/);
  await assert.rejects(gateway.action('member.update', { id: 'review-customer', role: 'admin' }), /access state/);
  await assert.rejects(setup('admin').gateway.action('member.update', { id: 'review-customer', role: 'admin', isActive: true }), /Super Admin/);
});
test('ABN lookup preserves native active status and official name without inventing verification', async () => {
  const calls = [];
  const { gateway } = setup('member', { callFunction: async (name, payload) => { calls.push({ name, payload }); return { active: false, abnStatus: 'Active', suggestedName: 'Official test name' }; } });
  const result = await gateway.lookupAbn('51824753556');
  assert.equal(result.active, false); assert.equal(result.name, 'Official test name');
  assert.deepEqual(calls, [{ name: 'lookupBusinessAbnForSubmission', payload: { abn: '51824753556' } }]);
});


test('operations is explicitly enabled and sends only the bounded reader and decision contracts', async () => {
  const calls = [], response = { supportRequests: [], moderationCases: [], nextCursor: null };
  const { gateway, writes } = setup('admin', { operationsEnabled: true, callFunction: async (name, payload) => { calls.push({ name, payload }); return response; } });
  assert.equal(setup('admin').gateway.loadOperations, undefined);
  await gateway.loadOperations({ view: 'moderation', id: 'a'.repeat(64), role: 'superAdmin', pageSize: 1000 });
  assert.deepEqual(calls[0], { name: 'listDirectoryOperations', payload: { view: 'moderation', id: 'a'.repeat(64), cursor: '', pageSize: 20 } });
  await gateway.action('moderation.decide', { id: 'a'.repeat(64), version: 0, decision: 'under-review', reason: 'Review details', city: 'melbourne', reporterEmail: 'private@example.test' });
  assert.deepEqual(calls[1], { name: 'decideDirectoryReport', payload: { id: 'a'.repeat(64), version: 0, decision: 'under-review', reason: 'Review details', expectedAppealId: '' } });
  assert.equal(writes.length, 0);
  await assert.rejects(setup('member', { operationsEnabled: true }).gateway.loadOperations({ view: 'moderation' }), /Administrator/);
});
test('operations reader discards responses after a scope change or session closure', async () => {
  let state;
  const response = { supportRequests: [], moderationCases: [], nextCursor: null };
  state = setup('admin', { operationsEnabled: true, callFunction: async () => { state.records.get('users/review-admin').adminCity = 'melbourne'; return response; } });
  await assert.rejects(state.gateway.loadOperations({ view: 'moderation' }), /scope changed/);
  state = setup('admin', { operationsEnabled: true, callFunction: async () => { state.gateway.close(); return response; } });
  await assert.rejects(state.gateway.loadOperations({ view: 'moderation' }), /session has ended/);
  state = setup('admin', { operationsEnabled: true, callFunction: async () => ({ supportRequests: [], moderationCases: [], nextCursor: 'bad-cursor' }) });
  await assert.rejects(state.gateway.loadOperations({ view: 'moderation' }), /Invalid operations response/);
});

test('legacy appeal pagination and version are transported without client authority',async()=>{
  const calls=[];
  const {gateway}=setup('admin',{operationsEnabled:true,callFunction:async(name,payload)=>{
    calls.push({name,payload});return {supportRequests:[],moderationCases:[],nextCursor:'native-notice-id'};
  }});
  await gateway.loadOperations({view:'appeals'});
  await gateway.action('moderation.decide',{id:'appeal:native-notice-id',version:0,decision:'closed',reason:'Retained decision reason.',
    expectedAppealId:'native-notice-id',expectedAppealVersion:'version-hash',ownerUid:'forged'});
  assert.equal(calls[0].payload.view,'appeals');
  assert.equal(calls[1].payload.expectedAppealVersion,'version-hash');
  assert.equal(Object.hasOwn(calls[1].payload,'ownerUid'),false);
});
