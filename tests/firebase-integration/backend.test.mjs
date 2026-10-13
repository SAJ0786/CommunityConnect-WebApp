import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { createLocalFunctionsTransport } from '../../src/services/directory/localFunctions.mjs';
import { DIRECTORY_STORAGE_BUCKET } from '../../src/services/directory/policy.mjs';
import { request, seed, token, waitForFirestore } from './emulatorRest.mjs';
import { seedRecords, identities } from './fixtures.mjs';
import { seedAuth, localAuth } from './authEmulator.mjs';
import { createRequire } from 'node:module';
import { createReminderHandlers } from '../../functions/web-event-reminders.cjs';
import { createMemberRegistrationHandlers } from '../../functions/member-registration.cjs';
import { createEventSeriesEditor } from '../../src/services/eventSeriesEdit.mjs';
import { initializeApp as initializeWebApp, deleteApp as deleteWebApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithCustomToken } from 'firebase/auth';
import * as firestoreSdk from 'firebase/firestore';
before(async () => { await waitForFirestore(); await seed(seedRecords()); await seedAuth(); });
const functions = name => createLocalFunctionsTransport({ user: identities[name], hostname: 'localhost' });

test('web operation endpoint refuses arbitrary destinations and malformed operation envelopes',async()=>{
  for(const operation of ['deleteUserData','https://example.test','callWebMemberOperation']) {
    await assert.rejects(functions('admin').call('callWebMemberOperation',{operation,payload:{}}),{code:'functions/invalid-argument'});
  }
  await assert.rejects(functions('admin').call('callWebMemberOperation',{operation:'archiveEventRecords',payload:[]}),{code:'functions/invalid-argument'});
});

test('web operation endpoint applies production account guards before its native handler',async()=>{
  await assert.rejects(functions('inactive').call('callWebMemberOperation',{operation:'sendBusinessEnquiry',payload:{businessId:'example',text:'Must not send'}}),{code:'functions/permission-denied'});
  await assert.rejects(functions('admin').call('callWebMemberOperation',{operation:'verifyBusinessAbn',payload:{businessId:'melbourne'}}),{code:'functions/permission-denied'});
});

test('member completion creates the verified profile, preserves existing authority and rejects inactive accounts',async()=>{
  const input={fullName:'Synthetic Registered Member',email:'registered@example.test',privacyAccepted:true,termsAccepted:true,legalVersion:'2026-09-08-community-connect'};
  await localAuth().updateUser('review-customer',{phoneNumber:'+61400000001'});
  await localAuth().updateUser('review-admin',{phoneNumber:'+61400000002'});
  try {
    await request('users/review-customer',{admin:true,method:'DELETE'});
    await functions('customer').call('completeMemberRegistration',{...input,role:'superAdmin',registeredAt:'forged'});
    const created=(await request('users/review-customer',{admin:true})).data.fields;
    assert.equal(created.role.stringValue,'user'); assert.equal(created.phone.stringValue,'+61400000001');
    assert.ok(created.registeredAt.timestampValue);
    await functions('customer').call('completeMemberRegistration',input);
    assert.equal((await request('users/review-customer',{admin:true})).data.fields.registeredAt.timestampValue,created.registeredAt.timestampValue);
    await functions('admin').call('completeMemberRegistration',input);
    const adminProfile=(await request('users/review-admin',{admin:true})).data.fields;
    assert.equal(adminProfile.role.stringValue,'admin'); assert.equal(adminProfile.adminCity.stringValue,'sydney');
    await assert.rejects(functions('customer').call('completeMemberRegistration',{...input,termsAccepted:false}),{code:'functions/failed-precondition'});
    await request('users/review-customer',{admin:true,method:'PATCH',mask:['active'],body:{active:false}});
    await assert.rejects(functions('customer').call('completeMemberRegistration',input),{code:'functions/permission-denied'});
  } finally {
    await seed({'users/review-customer':seedRecords()['users/review-customer'],'users/review-admin':seedRecords()['users/review-admin']});
    await localAuth().updateUser('review-customer',{phoneNumber:null});
    await localAuth().updateUser('review-admin',{phoneNumber:null});
  }
});

test('registration-date trigger is idempotent and uses the current document creation time',async()=>{
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:8089');
  const require=createRequire(new URL('./functions/package.json',import.meta.url));
  const {initializeApp,deleteApp}=require('firebase-admin/app'),{getFirestore}=require('firebase-admin/firestore');
  const app=initializeApp({projectId:'demo-community-connect-web'},'member-created-date');
  try {
    const db=getFirestore(app),ref=db.collection('users').doc('review-created-date');
    const handler=createMemberRegistrationHandlers({db}).recordCreated;
    await ref.set({role:'user',isActive:true});
    const first=await ref.get();
    await Promise.all([handler({data:first}),handler({data:first})]);
    assert.equal((await ref.get()).data().registeredAt.toMillis(),first.createTime.toMillis());
    await ref.delete();
    await handler({data:first});
    assert.equal((await ref.get()).exists,false);
    await ref.set({role:'user',isActive:true});
    const replacement=await ref.get();
    await handler({data:first});
    assert.equal((await ref.get()).data().registeredAt.toMillis(),replacement.createTime.toMillis());
    await ref.delete();
  } finally {await deleteApp(app);}
});

test('series rescheduling uses a real authenticated client transaction and refuses concurrent native edits',async()=>{
  const app=initializeWebApp({projectId:'demo-community-connect-web',apiKey:'synthetic-key'},'series-reschedule-test');
  const auth=getAuth(app);
  connectAuthEmulator(auth,'http://127.0.0.1:9098',{disableWarnings:true});
  const db=firestoreSdk.initializeFirestore(app,{experimentalForceLongPolling:true});
  firestoreSdk.connectFirestoreEmulator(db,'127.0.0.1',8089);
  try {
    await signInWithCustomToken(auth,await localAuth().createCustomToken('review-member'));
    const base={eventDate:'2099-10-12',startTime:'18:00',status:'active',createdByUserId:'review-member',seriesId:'reschedule-acceptance',metroArea:'sydney'};
    await seed({'events/reschedule-a':base,'events/reschedule-b':{...base,eventDate:'2099-10-19'},
      'events/reschedule-past':{...base,eventDate:'2000-01-01'},'events/reschedule-live':{...base,isLive:true}});
    const editor=createEventSeriesEditor({db,sdk:firestoreSdk,currentUser:()=>auth.currentUser,
      canEdit:(_,event,uid)=>event.createdByUserId===uid,prepareFields:updates=>updates});
    const preview=await editor.prepare(base);
    const schedule={occurrences:[{eventDate:'2099-11-01'},{eventDate:'2099-11-08'}],
      recurrence:{calendarType:'gregorian',frequency:'week',repeatEvery:1,endMode:'count',occurrenceCount:2}};
    assert.equal(await editor.save(preview,{notes:'Moved by web'},schedule),2);
    assert.equal((await request('events/reschedule-a',{admin:true})).data.fields.eventDate.stringValue,'2099-11-01');
    assert.equal((await request('events/reschedule-past',{admin:true})).data.fields.eventDate.stringValue,'2000-01-01');
    assert.equal((await request('events/reschedule-live',{admin:true})).data.fields.eventDate.stringValue,base.eventDate);
    const current=await editor.prepare(base);
    await request('events/reschedule-b',{admin:true,method:'PATCH',mask:['notes'],body:{notes:'Concurrent native change'}});
    await assert.rejects(editor.save(current,{notes:'Stale web overwrite'},schedule),/series changed/);
    assert.equal((await request('events/reschedule-b',{admin:true})).data.fields.notes.stringValue,'Concurrent native change');
  } finally {
    await firestoreSdk.terminate(db); await deleteWebApp(app);
  }
});

test('native standalone appeals are reviewed transactionally with owner history and city boundaries',async()=>{
  const notice={businessId:'example',ownerUid:'review-member',reportId:'native-standalone-report',decision:'takedown',
    reason:'Retain this original native decision.',appealStatus:'submitted',appealText:'Please review my older native appeal.',appealedBy:'review-member',appealedAt:new Date()};
  await seed({'businessModerationNotices/native-standalone':notice,'businessModerationNotices/native-other-city':{...notice,businessId:'melbourne'}});
  const row=(await functions('admin').call('listDirectoryOperations',{view:'appeals',id:'appeal:native-standalone'})).moderationCases[0];
  assert.equal(row.expectedAppealId,'native-standalone');
  assert.equal((await functions('admin').call('listDirectoryOperations',{view:'appeals',id:'appeal:native-other-city'})).moderationCases.length,0);
  const payload={id:row.id,version:0,expectedAppealId:row.expectedAppealId,expectedAppealVersion:row.expectedAppealVersion,decision:'dismissed',reason:'Reviewed the retained synthetic owner appeal.'};
  await assert.rejects(functions('member').call('decideDirectoryReport',payload),{code:'functions/permission-denied'});
  await assert.rejects(functions('admin').call('decideDirectoryReport',{...payload,id:'appeal:native-other-city',expectedAppealId:'native-other-city'}),{code:'functions/permission-denied'});
  const results=await Promise.allSettled([functions('admin').call('decideDirectoryReport',payload),functions('admin').call('decideDirectoryReport',payload)]);
  assert.equal(results.filter(item=>item.status==='fulfilled').length,1);
  const saved=await request('businessModerationNotices/native-standalone',{uid:'review-member'});
  assert.equal(saved.status,200); assert.equal(saved.data.fields.reason.stringValue,notice.reason);
  assert.equal(saved.data.fields.appealDecision.stringValue,'dismissed');
  assert.equal(saved.data.fields.appealText.stringValue,notice.appealText);
  assert.equal((await request('businesses/example',{admin:true})).data.fields.status.stringValue,'approved');
});

test('verified conversation report, block and unblock retain privacy and enforce direct-client reply rules',async()=>{
  await seed({'businessMessageThreads/moderation-verified':seedRecords()['businessMessageThreads/thread'],
    'businessMessageThreads/moderation-verified/messages/secret':{text:'Private conversation never returned to admin',senderUid:'review-customer'},
    'supportSubmissionLimits/review-customer':{lastAt:0}});
  const input={threadId:'moderation-verified',requestId:'verified_conversation_acceptance',reason:'Synthetic conversation concern for moderation.',businessId:'melbourne',city:'melbourne'};
  const receipt=await functions('customer').call('submitDirectoryConversationReport',input);
  assert.deepEqual(await functions('customer').call('submitDirectoryConversationReport',input),receipt);
  const read=async()=>(await functions('admin').call('listDirectoryOperations',{view:'moderation',id:receipt.reference})).moderationCases[0];
  const row=await read();
  assert.equal(row.businessId,'example'); assert.equal(row.city,'sydney');
  assert.equal(row.category,'business-conversation-report');
  assert.equal(JSON.stringify(row).includes('Private conversation never returned'),false);
  const decide=(decision,current)=>functions('admin').call('decideDirectoryReport',{id:receipt.reference,decision,version:current.version,
    expectedThreadVersion:current.expectedThreadVersion,reason:'Synthetic moderation decision for acceptance.'});
  await decide('conversation-blocked',row);
  assert.equal((await request('businessMessageThreads/moderation-verified',{uid:'review-admin'})).status,403);
  assert.equal((await request('businessMessageThreads/moderation-verified/messages/attempt',{uid:'review-customer',method:'PATCH',
    body:{text:'Blocked attempt',senderUid:'review-customer',kind:'text',createdAt:new Date()}})).status,403);
  await assert.rejects(decide('conversation-unblocked',{...row,version:1}),{code:'functions/failed-precondition'});
  const blocked=await read(); await decide('conversation-unblocked',blocked);
  assert.equal((await request('businessMessageThreads/moderation-verified/messages/allowed',{uid:'review-customer',method:'PATCH',
    body:{text:'Allowed after administrative unblock',senderUid:'review-customer',kind:'text',createdAt:new Date()}})).status,200);
  assert.equal((await request('businessModerationAudit/'+receipt.reference+'_00000002',{admin:true})).status,200);
  await seed({'supportSubmissionLimits/review-customer':{lastAt:0}});
});

test('conversation reporting refuses nonparticipants and moderation rechecks authoritative city',async()=>{
  await seed({'businessMessageThreads/moderation-denial':{...seedRecords()['businessMessageThreads/thread'],businessId:'melbourne'},
    'supportSubmissionLimits/review-customer':{lastAt:0}});
  const input={threadId:'moderation-denial',requestId:'verified_conversation_denial',reason:'Synthetic report in another administration city.'};
  await assert.rejects(functions('super').call('submitDirectoryConversationReport',input),{code:'functions/permission-denied'});
  await assert.rejects(functions('inactive').call('submitDirectoryConversationReport',input),{code:'functions/permission-denied'});
  const receipt=await functions('customer').call('submitDirectoryConversationReport',input);
  assert.equal((await functions('admin').call('listDirectoryOperations',{id:receipt.reference})).moderationCases.length,0);
  const row=(await functions('super').call('listDirectoryOperations',{id:receipt.reference})).moderationCases[0];
  await assert.rejects(functions('admin').call('decideDirectoryReport',{id:receipt.reference,version:0,decision:'conversation-blocked',
    expectedThreadVersion:row.expectedThreadVersion,reason:'Forged cross-city authority should fail.',city:'sydney'}),{code:'functions/permission-denied'});
  assert.equal((await request('businessMessageThreads/moderation-denial',{admin:true})).data.fields.adminBlocked.booleanValue,false);
  await seed({'supportSubmissionLimits/review-customer':{lastAt:0}});
});

test('reminder callables persist, isolate accounts, validate tokens and cancel without delivery',async()=>{
  const customer={...seedRecords()['users/review-customer'],pushNotificationsEnabled:true,fcmTokens:{'synthetic-browser-token':{source:'web'}}};
  await seed({'users/review-customer':customer,'events/reminder-callable':{eventDate:'2099-10-12',startTime:'18:00',metroArea:'sydney',status:'active'}});
  const data={eventId:'reminder-callable',deviceId:'synthetic-browser-device',minutesBefore:30,token:'synthetic-browser-token'};
  const result=await functions('customer').call('setEventReminder',data);
  assert.equal(result.reminder.status,'pending');
  assert.deepEqual(await functions('customer').call('getEventReminder',data),result);
  assert.equal((await functions('member').call('getEventReminder',data)).reminder,null);
  await assert.rejects(functions('member').call('setEventReminder',data),{code:'functions/permission-denied'});
  await assert.rejects(functions('customer').call('setEventReminder',{...data,minutesBefore:7}),{code:'functions/invalid-argument'});
  await assert.rejects(functions('inactive').call('setEventReminder',data),{code:'functions/permission-denied'});
  await functions('customer').call('removeEventReminder',data);
  assert.equal((await functions('customer').call('getEventReminder',data)).reminder.status,'cancelled');
});

test('real Firestore transactions allow only one competing reminder worker to dispatch',async()=>{
  const require=createRequire(new URL('./functions/package.json',import.meta.url));
  require('./isolation.cjs').assertLocalBackend(process.env);
  const {initializeApp,deleteApp}=require('firebase-admin/app'), {getFirestore}=require('firebase-admin/firestore');
  const app=initializeApp({projectId:'demo-community-connect-web'},'reminder-concurrency');
  try {
    const db=getFirestore(app), token='synthetic-concurrency-token', uid='review-customer';
    const date=new Date(Date.now()+3600000).toISOString();
    await seed({['users/'+uid]:{...seedRecords()['users/'+uid],pushNotificationsEnabled:true,fcmTokens:{[token]:{source:'web'}}},
      'events/reminder-concurrency':{eventDate:date.slice(0,10),startTime:date.slice(11,16),prayerTimeZone:'UTC',status:'active'}});
    const api=createReminderHandlers({db,HttpsError:Error});
    const req={auth:{uid,token:{firebase:{sign_in_provider:'phone'}}},data:{eventId:'reminder-concurrency',deviceId:'synthetic-concurrent-browser',minutesBefore:30,token}};
    const saved=await api.set(req);
    const docs=await db.collection('webEventReminders').where('eventId','==','reminder-concurrency').get();
    let count=0;
    const worker=createReminderHandlers({db,HttpsError:Error,now:()=>saved.reminder.fireAt+1000});
    const deliver=async()=>{count++;};
    await Promise.all([worker.process(docs.docs[0].id,deliver),worker.process(docs.docs[0].id,deliver)]);
    assert.equal(count,1);
    assert.equal((await api.get(req)).reminder.status,'sent');
  } finally { await deleteApp(app); }
});

const archiveEvent = (changes = {}) => ({ eventDate: '2099-10-11', startTime: '18:00', status: 'active',
  city: 'sydney', createdByUserId: 'review-member', hostName: 'Synthetic archive acceptance', ...changes });

test('event archive callable retains the owner record and audit in archivedEvents', async () => {
  await seed({ 'events/archive-single': archiveEvent() });
  assert.equal((await functions('member').call('archiveEventRecords', { eventId: 'archive-single' })).archived, 1);
  assert.equal((await request('events/archive-single', { admin: true })).status, 404);
  const saved = await request('archivedEvents/archive-single', { admin: true });
  assert.equal(saved.status, 200);
  assert.equal(saved.data.fields.archivedBy.stringValue, 'review-member');
  assert.equal(saved.data.fields.archivedFromEventId.stringValue, 'archive-single');
  assert.equal(saved.data.fields.hostName.stringValue, 'Synthetic archive acceptance');
});

test('event archive callable rejects non-owner, cross-city, inactive, live and old series operations', async () => {
  await seed({ 'events/archive-denied': archiveEvent(),
    'events/archive-other-city': archiveEvent({ city: 'melbourne' }),
    'events/archive-live': archiveEvent({ isLive: true }),
    'events/archive-inactive-owner': archiveEvent({ createdByUserId: 'review-inactive' }) });
  for (const [name, eventId, code] of [
    ['customer', 'archive-denied', 'permission-denied'],
    ['admin', 'archive-other-city', 'permission-denied'],
    ['member', 'archive-live', 'failed-precondition'],
    ['inactive', 'archive-inactive-owner', 'permission-denied'],
  ]) {
    await assert.rejects(functions(name).call('archiveEventRecords', { eventId }), { code: 'functions/' + code });
    assert.equal((await request('events/' + eventId, { admin: true })).status, 200);
    assert.equal((await request('archivedEvents/' + eventId, { admin: true })).status, 404);
  }
  await assert.rejects(functions('super').call('archiveEventRecords', { seriesId: 'archive-series' }), { code: 'functions/invalid-argument' });
});

test('future series callable deduplicates native fields, archives future only and retains series history', async () => {
  const seriesId = 'archive-browser-series';
  await seed({
    'events/archive-future': archiveEvent({ seriesId }),
    'events/archive-legacy': archiveEvent({ recurringSeriesId: seriesId }),
    'events/archive-both': archiveEvent({ seriesId, recurringSeriesId: seriesId }),
    'events/archive-past': archiveEvent({ seriesId, eventDate: '2000-01-01' }),
    'events/archive-stream': archiveEvent({ seriesId, isLive: true }),
    'events/archive-inactive': archiveEvent({ seriesId, status: 'inactive' }),
    ['recurringEventSeries/' + seriesId]: { status: 'active', title: 'Retained history' },
  });
  const expectedIds = ['archive-future', 'archive-legacy', 'archive-both'];
  const result = await functions('admin').call('archiveFutureSeriesEvents', { seriesId, expectedIds });
  assert.equal(result.archived, 3);
  assert.deepEqual(result.archivedIds.sort(), expectedIds.sort());
  for (const id of expectedIds) {
    assert.equal((await request('events/' + id, { admin: true })).status, 404);
    const record = await request('archivedEvents/' + id, { admin: true });
    assert.equal(record.status, 200);
    assert.equal(record.data.fields.archiveReason.stringValue, 'future_series_archived_by_user_or_admin');
  }
  for (const id of ['archive-past', 'archive-stream', 'archive-inactive']) assert.equal((await request('events/' + id, { admin: true })).status, 200);
  const series = await request('recurringEventSeries/' + seriesId, { admin: true });
  assert.equal(series.data.fields.status.stringValue, 'active');
  assert.equal(Number(series.data.fields.lastFutureDeletionCount.integerValue), 3);
});

test('future series callable refuses stale selection and mixed-city authority without partial deletion', async () => {
  const seriesId = 'archive-stale-series', expectedIds = ['archive-selected', 'archive-added'];
  await seed({
    'events/archive-selected': archiveEvent({ seriesId }),
    'events/archive-added': archiveEvent({ seriesId, city: 'melbourne' }),
  });
  for (const [name, ids, code] of [
    ['super', ['archive-selected'], 'failed-precondition'],
    ['admin', expectedIds, 'permission-denied'],
    ['member', expectedIds, 'permission-denied'],
    ['inactive', expectedIds, 'permission-denied'],
    ['super', ['archive-selected', 'archive-selected'], 'invalid-argument'],
  ]) {
    await assert.rejects(functions(name).call('archiveFutureSeriesEvents', { seriesId, expectedIds: ids }), { code: 'functions/' + code });
    for (const id of expectedIds) assert.equal((await request('events/' + id, { admin: true })).status, 200);
  }
  assert.equal((await functions('super').call('archiveFutureSeriesEvents', { seriesId, expectedIds })).archived, 2);
});

test('actual callable creates a conversation readable by its participants', async () => {
  const result = await functions('customer').call('sendBusinessEnquiry', { businessId: 'example', text: 'Emulator enquiry only', senderName: 'Test customer' });
  assert.ok(result.threadId);
  assert.equal((await request(`businessMessageThreads/${result.threadId}`, { uid: 'review-customer' })).status, 200);
  assert.equal((await request(`businessMessageThreads/${result.threadId}`, { uid: 'review-member' })).status, 200);
  assert.equal((await request(`businessMessageThreads/${result.threadId}`, { uid: 'review-super' })).status, 403);
});
test('actual support callable persists a stable receipt without a delivery trigger', async () => {
  const client = functions('member');
  const payload = { kind: 'app-feedback', category: 'Other', message: 'Isolated support acceptance only', requestId: 'isolated_backend_support_001' };
  const first = await client.call('submitSupportRequest', payload);
  assert.deepEqual(await client.call('submitSupportRequest', payload), first);
  const record = await request(`supportEmailOutbox/${first.reference}`, { admin: true });
  assert.equal(record.status, 200);
  assert.equal(record.data.fields.status.stringValue, 'queued');
  assert.equal((await request(`supportEmailOutbox/${first.reference}`, { uid: 'review-super' })).status, 403);
});
test('isolated callable wrapper refuses inactive test identities', async () => {
  await assert.rejects(functions('inactive').call('sendBusinessEnquiry', { businessId: 'example', text: 'Must not be sent' }), { code: 'functions/permission-denied' });
});

const png = Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,0]);
async function storage(path, { uid, bytes = png, type = 'image/png', method = 'POST' } = {}) {
  const base = `http://127.0.0.1:9198/v0/b/${DIRECTORY_STORAGE_BUCKET}/o`;
  const url = method === 'POST' ? `${base}?uploadType=media&name=${encodeURIComponent(path)}` : `${base}/${encodeURIComponent(path)}`;
  return fetch(url, { method, redirect: 'error', headers: { ...(uid ? { Authorization: `Firebase ${token(uid)}` } : {}), ...(method === 'POST' ? { 'Content-Type': type } : {}) },
    ...(method === 'POST' ? { body: bytes } : {}), signal: AbortSignal.timeout(10000) });
}
test('Storage accepts owner uploads and public reads, rejects cross-owner writes and deletes', async () => {
  const path = 'business-images/review-member/emulator-acceptance.png';
  assert.equal((await storage(path, { uid: 'review-member' })).status, 200);
  assert.equal((await storage(path, { method: 'GET' })).status, 200);
  assert.equal((await storage(path, { uid: 'review-customer' })).status, 403);
  assert.equal((await storage(path, { uid: 'review-customer', method: 'DELETE' })).status, 403);
  assert.equal((await storage(path, { uid: 'review-member', method: 'DELETE' })).status, 204);
});
test('Storage rejects anonymous, non-image and exactly 5 MB uploads', async () => {
  const path = 'business-images/review-member/emulator-denied.png';
  assert.equal((await storage(path)).status, 403);
  assert.equal((await storage(path, { uid: 'review-member', type: 'text/plain' })).status, 403);
  assert.equal((await storage(path, { uid: 'review-member', bytes: new Uint8Array(5 * 1024 * 1024) })).status, 403);
});

test('ABN callable prefill uses the synthetic provider and rejects repeated checks', async () => {
  const client = functions('customer');
  const result = await client.call('lookupBusinessAbnForSubmission', { abn: '51824753556' });
  assert.equal(result.suggestedName, 'Example Community Catering');
  assert.equal(result.active, true);
  await assert.rejects(client.call('lookupBusinessAbnForSubmission', { abn: '51824753556' }), { code: 'functions/resource-exhausted' });
});
test('ABN verification persists the native result with candidate city guards', async () => {
  await seed({ 'businesses/abn-acceptance': { ...seedRecords()['businesses/example'], abn: '51824753556', name: 'Example Community Catering' } });
  const result = await functions('admin').call('verifyBusinessAbn', { businessId: 'abn-acceptance' });
  assert.equal(result.verified, true);
  const saved = await request('businesses/abn-acceptance', { admin: true });
  assert.equal(saved.data.fields.abnVerified.booleanValue, true);
  assert.equal((await request('publicBusinesses/abn-acceptance', { admin: true })).status, 404);
  await seed({ 'businesses/abn-other-city': { ...seedRecords()['businesses/example'], abn: '51824753556', location: { city: 'melbourne' } } });
  await assert.rejects(functions('admin').call('verifyBusinessAbn', { businessId: 'abn-other-city' }), { code: 'functions/permission-denied' });
  await assert.rejects(functions('member').call('verifyBusinessAbn', { businessId: 'abn-acceptance' }), { code: 'functions/permission-denied' });
});
test('account archive and restore update emulator Auth, events and calendar with native semantics', async () => {
  await seed({ 'events/lifecycle-owned': { createdByUserId: 'review-customer', city: 'sydney' },
    'calendarSubscriptions/review-customer': { active: true } });
  const client = functions('super');
  const result = await client.call('adminDeleteUser', { targetUid: 'review-customer', ban: false });
  assert.equal(result.archived, true); assert.ok(result.eventsArchived >= 1);
  assert.equal((await localAuth().getUser('review-customer')).disabled, true);
  assert.equal((await request('events/lifecycle-owned', { admin: true })).status, 404);
  assert.equal((await request('archivedEvents/lifecycle-owned', { admin: true })).status, 200);
  assert.equal((await request('calendarSubscriptions/review-customer', { admin: true })).data.fields.active.booleanValue, false);
  await client.call('adminRestoreUser', { targetUid: 'review-customer' });
  assert.equal((await localAuth().getUser('review-customer')).disabled, false);
  assert.equal((await request('users/review-customer', { admin: true })).data.fields.isActive.booleanValue, true);
  assert.equal((await request('events/lifecycle-owned', { admin: true })).status, 404);
  assert.equal((await request('calendarSubscriptions/review-customer', { admin: true })).data.fields.active.booleanValue, false);
});
test('account callables reject unauthorised and non-synthetic targets', async () => {
  await assert.rejects(functions('member').call('adminDeleteUser', { targetUid: 'review-customer' }), { code: 'functions/permission-denied' });
  await assert.rejects(functions('admin').call('adminRestoreUser', { targetUid: 'review-customer' }), { code: 'functions/permission-denied' });
  await assert.rejects(functions('super').call('adminDeleteUser', { targetUid: 'real-user' }), { code: 'functions/invalid-argument' });
});

test('operations callable reads native reports with city scope and excludes private enquiry deliveries', async () => {
  const receipt = await functions('customer').call('submitSupportRequest', { kind: 'business-report', businessId: 'example',
    category: 'Other', message: 'Synthetic listing report for moderation acceptance.', requestId: 'operations_acceptance_report_001' });
  const city = await functions('admin').call('listDirectoryOperations', { view: 'deliveries' });
  assert.ok(city.supportRequests.some(row => row.reference === receipt.reference));
  assert.ok(city.supportRequests.every(row => row.kind === 'business-report' && row.city === 'sydney'));
  const global = await functions('super').call('listDirectoryOperations', { view: 'deliveries' });
  assert.ok(global.supportRequests.some(row => row.kind === 'app-feedback'));
  assert.ok(global.supportRequests.every(row => ['app-feedback', 'business-report'].includes(row.kind)));
  assert.ok(!JSON.stringify(global).includes('recipients'));
  await assert.rejects(functions('member').call('listDirectoryOperations', {}), { code: 'functions/permission-denied' });
  await assert.rejects(functions('inactive').call('listDirectoryOperations', {}), { code: 'functions/permission-denied' });
});

test('moderation transaction resolves concurrent decisions once, withdraws public records and retains owner appeals', async () => {
  const id = 'e'.repeat(64), client = functions('admin');
  await seed({ [`supportSubmissions/${id}`]: { kind: 'business-report', businessId: 'example', businessName: 'Example', city: 'sydney',
    category: 'Other', message: 'Synthetic private report', senderEmail: 'private-reporter@example.test' },
    'businessPromotions/moderation-acceptance': { businessId: 'example', ownerId: 'review-member', status: 'approved' },
    'publicBusinessPromotions/moderation-acceptance': { businessId: 'example', status: 'approved' },
    'businessContactRoutes/example': { ownerId: 'review-member' } });
  const input = { id, decision: 'under-review', version: 0, reason: 'Synthetic review of listing details.' };
  const competing = await Promise.allSettled([client.call('decideDirectoryReport', input), client.call('decideDirectoryReport', input)]);
  assert.equal(competing.filter(row => row.status === 'fulfilled').length, 1);
  assert.equal(competing.find(row => row.status === 'rejected').reason.code, 'functions/failed-precondition');
  const noticeId = `${id}_00000002`;
  await client.call('decideDirectoryReport', { ...input, decision: 'takedown', version: 1 });
  for (const path of ['publicBusinesses/example', 'businessContactRoutes/example', 'publicBusinessPromotions/moderation-acceptance'])
    assert.equal((await request(path, { admin: true })).status, 404);
  assert.equal((await request('businesses/example', { admin: true })).data.fields.status.stringValue, 'archived');
  assert.equal((await request('businessPromotions/moderation-acceptance', { admin: true })).data.fields.status.stringValue, 'archived');
  const notice = await request(`businessModerationNotices/${noticeId}`, { uid: 'review-member' });
  assert.equal(notice.status, 200);
  assert.ok(!JSON.stringify(notice.data).includes('private-reporter@example.test'));
  assert.equal((await request(`businessModerationNotices/${noticeId}`, { uid: 'review-customer' })).status, 403);
  const appeal = { appealStatus: 'submitted', appealText: 'Please review the synthetic correction.', appealedAt: new Date(), appealedBy: 'review-member' };
  assert.equal((await request(`businessModerationNotices/${noticeId}`, { uid: 'review-member', method: 'PATCH', body: appeal, mask: Object.keys(appeal) })).status, 200);
  const page = await client.call('listDirectoryOperations', { view: 'moderation', id });
  assert.equal(page.moderationCases[0].expectedAppealId, noticeId);
  await client.call('decideDirectoryReport', { ...input, version: 2, decision: 'dismissed', expectedAppealId: noticeId });
  const reviewed = await request(`businessModerationNotices/${noticeId}`, { uid: 'review-member' });
  assert.equal(reviewed.data.fields.appealStatus.stringValue, 'reviewed');
  assert.equal(reviewed.data.fields.decision.stringValue, 'takedown');
  assert.equal((await request('publicBusinesses/example', { admin: true })).status, 404);
  assert.equal((await request(`businessModerationAudit/${id}_00000003`, { admin: true })).data.fields.appealText.stringValue, appeal.appealText);
});

test('moderation rejects cross-city and client-forged authority; private cases remain server-only', async () => {
  const id = 'f'.repeat(64);
  await seed({ [`supportSubmissions/${id}`]: { kind: 'business-report', businessId: 'melbourne', city: 'melbourne', message: 'Synthetic cross-city report.' } });
  assert.equal((await functions('admin').call('listDirectoryOperations', { id })).supportRequests.length, 0);
  await assert.rejects(functions('admin').call('decideDirectoryReport', { id, version: 0, decision: 'takedown', city: 'sydney',
    reason: 'Synthetic cross-city refusal.' }), { code: 'functions/permission-denied' });
  assert.equal((await request(`businessModerationCases/${id}`, { uid: 'review-admin', method: 'PATCH', body: { status: 'closed', version: 1 } })).status, 403);
  await assert.rejects(functions('super').call('decideDirectoryReport', { id, version: 0, decision: 'conversation-blocked',
    reason: 'Do not trust a free-text conversation reference.' }), { code: 'functions/failed-precondition' });
});
