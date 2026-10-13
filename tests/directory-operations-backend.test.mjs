import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from './firebase-integration/functions/directory-operations.cjs';
import { recordingAdmin } from './firebase-integration/recordingAdmin.mjs';
import { seedRecords } from './firebase-integration/fixtures.mjs';
class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
const ids = ['a','b','c','d'].map(value => value.repeat(64));
const report = (businessId, city) => ({ kind: 'business-report', businessId, city, businessName: 'Synthetic listing',
  message: 'Private report details', senderEmail: 'reporter@example.test', senderName: 'Reporter', category: 'Other', submittedAt: '2026-10-10T10:00:00Z' });
const legacyNotice = { businessId:'example',ownerUid:'review-member',reportId:'native-feedback-id',decision:'takedown',
  reason:'Original retained reason.',appealStatus:'submitted',appealText:'Please reconsider this older decision.',
  appealedBy:'review-member',appealedAt:'2026-10-12T00:00:00Z' };
function setup() {
  const state = recordingAdmin({ ...seedRecords(),
    [`supportSubmissions/${ids[0]}`]: report('example', 'sydney'),
    [`supportSubmissions/${ids[1]}`]: report('melbourne', 'melbourne'),
    [`supportSubmissions/${ids[2]}`]: { ...report('', 'sydney'), kind: 'app-feedback' },
    [`supportEmailOutbox/${ids[0]}`]: { status: 'queued', recipients: ['secret@example.test'], lastError: 'Private provider details' },
    [`supportEmailOutbox/${ids[3]}`]: { kind: 'business-enquiry', message: 'Private conversation' },
    'businessContactRoutes/example': { ownerId: 'review-member' },
    'businessPromotions/moderation-promo': { businessId: 'example', ownerId: 'review-member', status: 'approved' },
    'publicBusinessPromotions/moderation-promo': { businessId: 'example' },
  });
  const handlers = register({ ...state, FieldPath: { documentId: () => '__name__' }, HttpsError, REGION: 'australia-southeast1', onCall: (_, fn) => fn });
  const call = (name, uid, data = {}) => handlers[name]({ auth: uid ? { uid, token: { firebase: { sign_in_provider: 'phone' } } } : null, data });
  return { ...state, handlers, list: (uid = 'review-admin', data) => call('listDirectoryOperations', uid, data),
    report:(data={},uid='review-customer')=>call('submitDirectoryConversationReport',uid,{threadId:'thread',requestId:'synthetic_conversation_report',reason:'Please review this conversation concern.',...data}),
    decide: (data = {}, uid = 'review-admin') => call('decideDirectoryReport', uid, { id: ids[0], version: 0, decision: 'under-review', reason: 'Reviewing the listing details.', ...data }) };
}

test('operations reader scopes city staff and explicitly projects support fields without enquiry data', async () => {
  const state = setup();
  const city = await state.list('review-admin', { city: 'melbourne' });
  assert.deepEqual(city.supportRequests.map(row => row.reference), [ids[0]]);
  assert.equal(city.supportRequests[0].deliveryStatus, 'queued');
  const all = await state.list('review-super');
  assert.equal(all.supportRequests.length, 3); assert.equal(all.moderationCases.length, 2);
  for (const forbidden of ['secret@example.test','Private provider details','Private conversation','recipients']) assert.ok(!JSON.stringify(all).includes(forbidden));
  assert.equal((await state.list('review-super', { view: 'moderation' })).supportRequests.length, 2);
});

test('standalone appeals are discoverable with bounded pagination and preserve original native notices', async () => {
  const state=setup();
  state.records.set('businessModerationNotices/legacy-a',legacyNotice);
  state.records.set('businessModerationNotices/legacy-b',{...legacyNotice,reportId:ids[0]});
  state.records.set('businessModerationNotices/legacy-c',{...legacyNotice,businessId:'melbourne'});
  const first=await state.list('review-admin',{view:'appeals',pageSize:1});
  assert.equal(first.nextCursor,'legacy-a'); assert.equal(first.moderationCases[0].id,'appeal:legacy-a');
  const empty=await state.list('review-admin',{view:'appeals',pageSize:1,cursor:first.nextCursor});
  assert.equal(empty.moderationCases.length,0); assert.equal(empty.nextCursor,'legacy-b');
  const row=first.moderationCases[0];
  assert.deepEqual(row.availableDecisions,['under-review','dismissed','closed']);
  const input={id:row.id,expectedAppealId:row.expectedAppealId,expectedAppealVersion:row.expectedAppealVersion,decision:'under-review'};
  await state.decide(input);
  const current=(await state.list('review-admin',{id:row.id})).moderationCases[0];
  await state.decide({...input,decision:'dismissed',version:1,expectedAppealVersion:current.expectedAppealVersion});
  const saved=state.records.get('businessModerationNotices/legacy-a');
  assert.equal(saved.appealStatus,'reviewed'); assert.equal(saved.reason,legacyNotice.reason);
  assert.equal(saved.decision,'takedown'); assert.equal(saved.appealText,legacyNotice.appealText);
  assert.equal(saved.appealDecision,'dismissed');
  assert.equal(state.records.get('businessModerationAudit/legacy-appeal-legacy-a_00000002').appealText,legacyNotice.appealText);
  assert.equal(state.records.get('businesses/example').status,'approved');
  await assert.rejects(state.decide(input),{code:'failed-precondition'});
});

test('legacy appeal decisions reject changed appeals, linked reports, scope changes and members without writes',async()=>{
  for(const mode of ['changed','linked','city','owner','inactive','member']) {
    const state=setup(); state.records.set('businessModerationNotices/legacy-a',{...legacyNotice});
    const row=(await state.list('review-admin',{view:'appeals'})).moderationCases[0];
    if(mode==='changed')state.records.get('businessModerationNotices/legacy-a').appealText='New appeal text after preview.';
    if(mode==='linked')state.records.set('supportSubmissions/native-feedback-id',report('example','sydney'));
    if(mode==='city')state.records.get('businesses/example').location.city='melbourne';
    if(mode==='owner')state.records.get('businesses/example').ownerId='review-customer';
    if(mode==='inactive')state.records.get('users/review-admin').isActive=false;
    const before=[...state.records];
    await assert.rejects(state.decide({id:row.id,expectedAppealId:row.expectedAppealId,expectedAppealVersion:row.expectedAppealVersion,decision:'closed'},
      mode==='member'?'review-member':'review-admin'));
    assert.deepEqual([...state.records],before);
  }
});
test('operations reader rejects members, inactive admins, anonymous users and unassigned city staff', async () => {
  const state = setup();
  for (const uid of ['review-member','review-inactive']) await assert.rejects(state.list(uid), { code: 'permission-denied' });
  await assert.rejects(state.list(null), { code: 'unauthenticated' });
  await assert.rejects(state.handlers.listDirectoryOperations({ auth: { uid: 'review-admin', token: { firebase: { sign_in_provider: 'anonymous' } } } }), { code: 'unauthenticated' });
  state.records.get('users/review-admin').adminCity = 'unknown';
  await assert.rejects(state.list(), { code: 'permission-denied' });
  state.records.get('users/review-super').isActive = false;
  await assert.rejects(state.list('review-super'), { code: 'permission-denied' });
});
test('operations pagination, direct case reads and empty filtered pages preserve access boundaries', async () => {
  const state = setup();
  const first = await state.list('review-super', { pageSize: 1 });
  assert.equal(first.nextCursor, ids[0]);
  const second = await state.list('review-super', { pageSize: 1, cursor: first.nextCursor });
  assert.equal(second.supportRequests[0].reference, ids[1]);
  assert.equal((await state.list('review-admin', { id: ids[1] })).supportRequests.length, 0);
  assert.equal((await state.list('review-super', { id: ids[2] })).supportRequests[0].kind, 'app-feedback');
  state.records.get('businesses/example').location.city = 'melbourne';
  state.records.set(`supportSubmissions/${ids[3]}`, report('pending', 'sydney'));
  const empty = await state.list('review-admin', { pageSize: 1 });
  assert.equal(empty.supportRequests.length, 0); assert.equal(empty.nextCursor, ids[0]);
  for (const data of [{ pageSize: 26 }, { cursor: '../x' }, { id: 'x' }, { view: 'outbox' }]) await assert.rejects(state.list('review-admin', data), { code: 'invalid-argument' });
});
test('permissions revoked during operations retrieval discard the private response', async () => {
  const state = setup(), original = state.db.collection;
  state.db.collection = path => {
    const ref = original(path);
    if (path === 'supportEmailOutbox') state.records.get('users/review-admin').isActive = false;
    return ref;
  };
  await assert.rejects(state.list(), { code: 'permission-denied' });
});
test('moderation decisions create private audit and owner notice once; stale retries cannot duplicate', async () => {
  const state = setup(), result = await state.decide();
  assert.equal(result.version, 1);
  const noticeId = `${ids[0]}_00000001`;
  const notice = state.records.get(`businessModerationNotices/${noticeId}`);
  assert.equal(notice.ownerUid, 'review-member');
  assert.equal(notice.decision, 'under-review');
  assert.ok(!JSON.stringify(notice).includes('reporter@example.test'));
  const audit = state.records.get(`businessModerationAudit/${noticeId}`);
  assert.equal(audit.actorUid, 'review-admin');
  assert.ok(!JSON.stringify(audit).includes('Private report details'));
  const before = [...state.records];
  await assert.rejects(state.decide(), { code: 'failed-precondition' });
  assert.deepEqual([...state.records], before);
});
test('takedown atomically withdraws public business, contact route and promotions while retaining private history', async () => {
  const state = setup();
  await state.decide({ decision: 'takedown' });
  assert.equal(state.records.get('businesses/example').status, 'archived');
  assert.equal(state.records.get('businessPromotions/moderation-promo').status, 'archived');
  for (const path of ['publicBusinesses/example','businessContactRoutes/example','publicBusinessPromotions/moderation-promo']) assert.equal(state.records.has(path), false);
  assert.equal(state.records.has(`supportSubmissions/${ids[0]}`), true);
  assert.equal(state.records.has('businessMessageThreads/thread'), true);
  assert.ok(!(await state.list()).moderationCases[0].availableDecisions.includes('takedown'));
});
test('takedown bounds the transaction before any write when too many promotions exist', async () => {
  const state = setup();
  for (let n = 0; n < 201; n++) state.records.set(`businessPromotions/bulk-${n}`, { businessId: 'example', status: 'approved' });
  const before = [...state.records];
  await assert.rejects(state.decide({ decision: 'takedown' }), { code: 'failed-precondition' });
  assert.deepEqual([...state.records], before);
});
test('moderation refuses cross-city, inactive, unsupported conversation and app-feedback decisions', async () => {
  const state = setup(), before = [...state.records];
  await assert.rejects(state.decide({ id: ids[1], city: 'sydney' }), { code: 'permission-denied' });
  await assert.rejects(state.decide({ id: ids[2] }), { code: 'not-found' });
  await assert.rejects(state.decide({ decision: 'conversation-blocked', threadId: 'thread' }), { code: 'failed-precondition' });
  await assert.rejects(state.decide({}, 'review-member'), { code: 'permission-denied' });
  assert.deepEqual([...state.records], before);
  state.records.get('businesses/example').location.city = 'melbourne';
  await assert.rejects(state.decide(), { code: 'permission-denied' });
  state.records.get('users/review-super').active = false;
  await assert.rejects(state.decide({}, 'review-super'), { code: 'permission-denied' });
});
test('owner appeal review preserves original notice and appeal, requires current appeal, and does not republish', async () => {
  const state = setup();
  await state.decide({ decision: 'takedown' });
  const noticeId = `${ids[0]}_00000001`, notice = state.records.get(`businessModerationNotices/${noticeId}`);
  Object.assign(notice, { appealStatus: 'submitted', appealText: 'Please review the corrected information.', appealedAt: new Date() });
  const row = (await state.list()).moderationCases[0];
  assert.equal(row.category, 'business-appeal'); assert.equal(row.expectedAppealId, noticeId);
  await assert.rejects(state.decide({ version: 1, decision: 'dismissed' }), { code: 'failed-precondition' });
  await state.decide({ version: 1, decision: 'dismissed', expectedAppealId: noticeId });
  const reviewed = state.records.get(`businessModerationNotices/${noticeId}`);
  assert.equal(reviewed.appealStatus, 'reviewed'); assert.equal(reviewed.decision, 'takedown');
  assert.equal(reviewed.appealText, notice.appealText);
  assert.equal(state.records.get('businesses/example').status, 'archived');
  assert.equal(state.records.has('publicBusinesses/example'), false);
  assert.equal(state.records.get(`businessModerationAudit/${ids[0]}_00000002`).appealText, notice.appealText);
});

test('an appeal to an older notice remains visible after a later decision has been recorded', async () => {
  const state = setup();
  await state.decide();
  await state.decide({ version: 1, decision: 'closed' });
  const olderId = `${ids[0]}_00000001`;
  Object.assign(state.records.get(`businessModerationNotices/${olderId}`),
    { appealStatus: 'submitted', appealText: 'Appealing the earlier decision notice.', appealedAt: new Date() });
  const row = (await state.list()).moderationCases[0];
  assert.equal(row.expectedAppealId, olderId);
  await state.decide({ version: 2, decision: 'closed', expectedAppealId: olderId });
  assert.equal(state.records.get(`businessModerationNotices/${olderId}`).appealStatus, 'reviewed');
});

test('verified conversation reports bind the authenticated participant and business with idempotent receipts',async()=>{
  const state=setup(), result=await state.report({city:'melbourne',businessId:'melbourne',senderUid:'review-super'});
  const saved=state.records.get('supportSubmissions/'+result.reference);
  assert.equal(saved.senderUid,'review-customer'); assert.equal(saved.businessId,'example'); assert.equal(saved.city,'sydney');
  assert.equal(saved.reportedThreadId,'thread'); assert.equal(saved.reportSource,'verified-conversation');
  assert.deepEqual(await state.report(),result);
  await assert.rejects(state.report({reason:'Changed report using the same reference.'}),{code:'already-exists'});
  await assert.rejects(state.report({requestId:'synthetic_second_report'}),{code:'resource-exhausted'});
  assert.equal(state.records.has('supportEmailOutbox/'+result.reference),false);
  const row=(await state.list('review-admin',{id:result.reference})).moderationCases[0];
  assert.equal(row.category,'business-conversation-report');
  assert.ok(row.availableDecisions.includes('conversation-blocked'));
  assert.equal(JSON.stringify(row).includes('Sample enquiry'),false);
});

test('reporting rejects nonparticipants, inactive accounts, anonymous sessions and forged references',async()=>{
  const state=setup(), before=[...state.records];
  for(const uid of ['review-admin','review-super','review-inactive']) await assert.rejects(state.report({},uid),{code:'permission-denied'});
  await assert.rejects(state.report({},null),{code:'unauthenticated'});
  await assert.rejects(state.report({threadId:'missing'}),{code:'permission-denied'});
  await assert.rejects(state.report({threadId:'../thread'}),{code:'invalid-argument'});
  await assert.rejects(state.handlers.submitDirectoryConversationReport({auth:{uid:'review-customer',token:{firebase:{sign_in_provider:'anonymous'}}},data:{}}),{code:'unauthenticated'});
  assert.deepEqual([...state.records],before);
});

test('verified blocks and unblocks retain private messages, audit and participant blocks; stale state is refused',async()=>{
  const state=setup(), {reference:id}=await state.report();
  const row=(await state.list('review-admin',{id})).moderationCases[0];
  const payload={id,decision:'conversation-blocked',expectedThreadVersion:row.expectedThreadVersion};
  await state.decide(payload);
  assert.equal(state.records.get('businessMessageThreads/thread').adminBlocked,true);
  assert.equal(state.records.get('businessModerationAudit/'+id+'_00000001').reportedThreadId,'thread');
  assert.equal(state.records.has('businessMessageThreads/thread/messages/first'),true);
  await assert.rejects(state.decide({...payload,version:1,decision:'conversation-unblocked'}),{code:'failed-precondition'});
  state.records.get('businessMessageThreads/thread').blockedBy={'review-customer':true};
  const current=(await state.list('review-admin',{id})).moderationCases[0];
  await state.decide({id,version:1,decision:'conversation-unblocked',expectedThreadVersion:current.expectedThreadVersion});
  assert.equal(state.records.get('businessMessageThreads/thread').adminBlocked,false);
  assert.equal(state.records.get('businessMessageThreads/thread').blockedBy['review-customer'],true);
  assert.equal(state.records.get('businessModerationNotices/'+id+'_00000002').decision,'conversation-unblocked');
});

test('conversation decisions reject cross-city and changed report relationships before writes',async()=>{
  for(const mode of ['city','business','participant','unverified']) {
    const state=setup(), {reference:id}=await state.report();
    const row=(await state.list('review-admin',{id})).moderationCases[0];
    if(mode==='city')state.records.get('businesses/example').location.city='melbourne';
    if(mode==='business')state.records.get('businessMessageThreads/thread').businessId='melbourne';
    if(mode==='participant')state.records.get('businessMessageThreads/thread').participantUids=['review-member','review-super'];
    if(mode==='unverified')delete state.records.get('supportSubmissions/'+id).reportSource;
    const before=[...state.records];
    await assert.rejects(state.decide({id,decision:'conversation-blocked',expectedThreadVersion:row.expectedThreadVersion}),
      {code:mode==='city'?'permission-denied':'failed-precondition'});
    assert.deepEqual([...state.records],before);
  }
});
