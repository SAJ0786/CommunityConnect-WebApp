import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { seedRecords, validRuleSubmission as validSubmission } from './fixtures.mjs';
import { request, seed, waitForFirestore, commit } from './emulatorRest.mjs';

before(async () => { await waitForFirestore(); await seed(seedRecords()); });

test('conversation administrator blocks enforce current business city and active account without exposing messages',async()=>{
  const thread=seedRecords()['businessMessageThreads/thread'];
  await seed({'businessMessageThreads/block-own':thread,'businessMessageThreads/block-other':{...thread,businessId:'melbourne'},
    'users/block-inactive-admin':{role:'admin',adminCity:'sydney',isActive:false}});
  const body={adminBlocked:true,adminBlockedReason:'Synthetic administrator action',adminBlockedBy:'review-admin',adminBlockedAt:new Date()};
  const options={method:'PATCH',mask:Object.keys(body),body};
  assert.equal((await request('businessMessageThreads/block-own',{...options,uid:'review-admin'})).status,200);
  assert.equal((await request('businessMessageThreads/block-other',{...options,uid:'review-admin'})).status,403);
  assert.equal((await request('businessMessageThreads/block-own',{...options,uid:'block-inactive-admin'})).status,403);
  assert.equal((await request('businessMessageThreads/block-other',{...options,uid:'review-super'})).status,200);
  assert.equal((await request('businessMessageThreads/block-own',{uid:'review-admin'})).status,403);
  assert.equal((await request('businessMessageThreads/block-own',{...options,uid:'review-member',body:{...body,adminBlocked:false}})).status,403);
});

test('an administrator block survives participant unblock and prevents direct message creation',async()=>{
  const thread={...seedRecords()['businessMessageThreads/thread'],adminBlocked:true,blockedBy:{'review-member':true}};
  await seed({'businessMessageThreads/block-replies':thread});
  assert.equal((await request('businessMessageThreads/block-replies',{uid:'review-member',method:'PATCH',mask:['blockedBy'],body:{blockedBy:{'review-member':false}}})).status,200);
  const result=await request('businessMessageThreads/block-replies/messages/attempt',{uid:'review-member',method:'PATCH',
    body:{text:'Synthetic reply should be refused',senderUid:'review-member',kind:'text',createdAt:new Date()}});
  assert.equal(result.status,403);
});

test('native host message batch is readable and replyable only by active participants', async () => {
  await seed({'events/host-rule-event':{createdByUserId:'review-member',status:'active'}});
  const path='hostMessageThreads/host-rule-thread';
  const thread={type:'host',eventId:'host-rule-event',hostUid:'review-member',senderUid:'review-customer',
    participantUids:['review-customer','review-member'],lastMessage:'Synthetic enquiry',unreadBy:{'review-member':1,'review-customer':0}};
  const message={senderUid:'review-customer',senderName:'Test customer',text:'Synthetic enquiry',kind:'text',createdAt:new Date()};
  const result=await commit([{path,body:thread},{path:path+'/messages/first',body:message}],{uid:'review-customer'});
  assert.equal(result.status,200,JSON.stringify(result.data));
  for(const uid of ['review-member','review-customer']) assert.equal((await request(path,{uid})).status,200);
  for(const uid of ['review-super','review-inactive']) assert.equal((await request(path,{uid})).status,403);
  assert.equal((await request(path+'/messages/reply',{uid:'review-member',method:'PATCH',body:{...message,senderUid:'review-member',text:'Host reply'}})).status,200);
  assert.equal((await request(path,{uid:'review-member',method:'PATCH',mask:['unreadBy'],body:{unreadBy:{'review-member':0,'review-customer':1}}})).status,200);
  assert.equal((await request(path,{uid:'review-member',method:'PATCH',mask:['hostUid'],body:{hostUid:'review-super'}})).status,403);
  for(const text of ['', 'x'.repeat(2001)]) assert.equal((await request(path+'/messages/bad-'+text.length,{uid:'review-member',method:'PATCH',body:{...message,senderUid:'review-member',text}})).status,403);
  assert.equal((await request(path+'/messages/spoof',{uid:'review-customer',method:'PATCH',body:{...message,senderUid:'review-member'}})).status,403);
  assert.equal((await request(path+'/messages/first',{uid:'review-member',method:'DELETE'})).status,403);
});

test('host thread creation validates event host, legacy host fields, visibility and active membership', async () => {
  const base={type:'host',eventId:'host-rule-source',hostUid:'review-member',senderUid:'review-customer',participantUids:['review-customer','review-member']};
  for(const [name,event,uid,host,expected] of [
    ['valid',{createdByUserId:'review-member'},'review-customer','review-member',200],
    ['legacy',{createdByUserId:'',ownerUid:'review-member'},'review-customer','review-member',200],
    ['forged',{createdByUserId:'review-member'},'review-customer','review-super',403],
    ['hidden',{createdByUserId:'review-member',hidden:true},'review-customer','review-member',403],
    ['archived',{createdByUserId:'review-member',status:'archived'},'review-customer','review-member',403],
    ['inactive',{createdByUserId:'review-member'},'review-inactive','review-member',403],
  ]) {
    await seed({'events/host-rule-source':event});
    assert.equal((await request('hostMessageThreads/host-rule-'+name,{uid,method:'PATCH',body:{...base,senderUid:uid,hostUid:host,participantUids:[uid,host]}})).status,expected,name);
  }
  assert.equal((await request('webEventReminders/client-forged',{uid:'review-member',method:'PATCH',body:{status:'pending',token:'synthetic'}})).status,403);
});

test('public projection is readable without authentication; private listing is denied', async () => {
  assert.equal((await request('publicBusinesses/example')).status, 200);
  assert.equal((await request('businesses/example')).status, 403);
});
test('member reads own private listing but cannot read another owner submission', async () => {
  assert.equal((await request('businesses/example', { uid: 'review-member' })).status, 200);
  assert.equal((await request('businesses/example', { uid: 'review-customer' })).status, 403);
});
test('saved business update is self-only and cannot escalate a role', async () => {
  assert.equal((await request('users/review-member', { uid: 'review-member', method: 'PATCH', mask: ['savedBusinesses'], body: { savedBusinesses: ['example'] } })).status, 200);
  assert.equal((await request('users/review-customer', { uid: 'review-member', method: 'PATCH', mask: ['savedBusinesses'], body: { savedBusinesses: ['example'] } })).status, 403);
  assert.equal((await request('users/review-member', { uid: 'review-member', method: 'PATCH', mask: ['role'], body: { role: 'superAdmin' } })).status, 403);
});

test('legacy native profile creation remains allowed while server registration dates cannot be rewritten',async()=>{
  const uid='review-native-legacy',path='users/'+uid;
  const legacy={role:'user',isActive:true,accountStatus:'active',savedEvents:[],fullName:'Synthetic Legacy Member',
    email:'legacy@example.test',phone:'+61400000003',phoneVerified:true,privacyAccepted:true,termsAccepted:true,
    legalAcceptedAtClient:'2026-10-12T00:00:00.000Z'};
  assert.equal((await request(path,{uid,method:'PATCH',body:legacy})).status,200);
  assert.equal((await request(path,{uid,method:'PATCH',mask:['fullName'],body:{fullName:'Updated Legacy Member'}})).status,200);
  for(const field of ['registeredAt','profileCompletedAt','legalAcceptedAt']) {
    assert.equal((await request(path,{uid,method:'PATCH',mask:[field],body:{[field]:new Date()}})).status,403,field);
  }
  await request(path,{admin:true,method:'DELETE'});
});
test('native listing create contract requires terms and pending review', async () => {
  const body = validSubmission('review-member');
  const result = await request('businesses/rule-created', { uid: 'review-member', method: 'PATCH', body });
  assert.equal(result.status, 200, JSON.stringify(result.data.error));
  assert.equal((await request('businesses/rule-illegal', { uid: 'review-member', method: 'PATCH', body: { ...body, status: 'approved' } })).status, 403);
});
test('private conversation reads and replies are participant-only, including administrators', async () => {
  assert.equal((await request('businessMessageThreads/thread', { uid: 'review-member' })).status, 200);
  assert.equal((await request('businessMessageThreads/thread', { uid: 'review-super' })).status, 403);
  const body = { text: 'Local emulator test reply', senderUid: 'review-member', kind: 'text', createdAt: new Date() };
  assert.equal((await request('businessMessageThreads/thread/messages/rule-reply', { uid: 'review-member', method: 'PATCH', body })).status, 200);
  assert.equal((await request('businessMessageThreads/thread/messages/rule-forbidden', { uid: 'review-super', method: 'PATCH', body: { ...body, senderUid: 'review-super' } })).status, 403);
});
test('city administrators cannot approve another city private submission', async () => {
  assert.equal((await request('businesses/melbourne', { uid: 'review-admin', method: 'PATCH', mask: ['status'], body: { status: 'approved' } })).status, 403);
});
test('notification updates are recipient-only and cannot erase history', async () => {
  assert.equal((await request('userNotifications/notice', { uid: 'review-member', method: 'PATCH', mask: ['read'], body: { read: true } })).status, 200);
  assert.equal((await request('userNotifications/notice', { uid: 'review-customer', method: 'PATCH', mask: ['read'], body: { read: true } })).status, 403);
  assert.equal((await request('userNotifications/notice', { uid: 'review-member', method: 'DELETE' })).status, 403);
});
// These are release requirements, not expected-success tests of permissive rules.
// Keep failures visible until the separately reviewed backend work resolves them.
test('RELEASE GATE: inactive accounts cannot create business submissions', async () => {
  const control = validSubmission('review-member');
  assert.equal((await request('businesses/inactive-control', { uid: 'review-member', method: 'PATCH', body: control })).status, 200,
    'The same complete submission must be accepted for an active account before testing inactivity.');
  const body = { ...control, ownerId: 'review-inactive' };
  assert.equal((await request('businesses/inactive-attempt', { uid: 'review-inactive', method: 'PATCH', body })).status, 403,
    'Rules must enforce inactive-account restrictions independently of the web UI.');
});

test('RELEASE GATE: archived/banned states deny creation while older active profiles remain compatible', async () => {
  for (const [suffix, state] of [['legacy', {}], ['active-flag', { active: false }], ['archived', { accountStatus: 'archived' }], ['banned', { accountStatus: 'banned' }]]) {
    const uid = `review-rule-${suffix}`;
    await seed({ [`users/${uid}`]: { fullName: 'Synthetic rules account', role: 'user', defaultCity: 'sydney', ...state } });
    const result = await request(`businesses/status-${suffix}`, { uid, method: 'PATCH', body: validSubmission(uid) });
    assert.equal(result.status, suffix === 'legacy' ? 200 : 403, `${suffix}: account state must be evaluated with a valid submission.`);
  }
});

test('same-city public projection changes remain available to city admins', async () => {
  assert.equal((await request('publicBusinesses/example', { uid: 'review-admin', method: 'PATCH', mask: ['name'], body: { name: 'Same-city update' } })).status, 200);
});

test('RELEASE GATE: changing a public city or deleting another city projection cannot evade scope', async () => {
  const original = seedRecords()['publicBusinesses/melbourne'];
  assert.equal((await request('publicBusinesses/melbourne', { uid: 'review-admin', method: 'PATCH', mask: ['location'], body: { location: { ...original.location, city: 'sydney' } } })).status, 403);
  assert.equal((await request('publicBusinesses/melbourne', { uid: 'review-admin', method: 'DELETE' })).status, 403);
});

test('RELEASE GATE: new projections require the private business city, not a claimed public city', async () => {
  const projection = seedRecords()['publicBusinesses/example'];
  const parent = seedRecords()['businesses/example'];
  await seed({ 'businesses/city-create-own': parent, 'businesses/city-create-other': { ...parent, location: { ...parent.location, city: 'melbourne' } } });
  assert.equal((await request('publicBusinesses/city-create-own', { uid: 'review-admin', method: 'PATCH', body: projection })).status, 200);
  assert.equal((await request('publicBusinesses/city-create-other', { uid: 'review-admin', method: 'PATCH', body: projection })).status, 403);
});

test('super administration and owner withdrawal preserve existing projection workflows', async () => {
  const records = seedRecords(), own = records['businesses/example'], other = records['businesses/melbourne'];
  await seed({ 'businesses/owner-withdrawal': own, 'publicBusinesses/owner-withdrawal': records['publicBusinesses/example'],
    'businesses/super-other-city': other, 'publicBusinesses/super-other-city': records['publicBusinesses/melbourne'] });
  assert.equal((await request('publicBusinesses/super-other-city', { uid: 'review-super', method: 'PATCH', mask: ['name'], body: { name: 'Super review' } })).status, 200);
  assert.equal((await request('publicBusinesses/super-other-city', { uid: 'review-super', method: 'DELETE' })).status, 200);
  assert.equal((await request('publicBusinesses/owner-withdrawal', { uid: 'review-member', method: 'DELETE' })).status, 200);
});
test('RELEASE GATE: city administrators cannot change another city public projection', async () => {
  assert.equal((await request('publicBusinesses/melbourne', { uid: 'review-admin', method: 'PATCH', mask: ['name'], body: { name: 'Cross-city attempt' } })).status, 403,
    'Public projection writes need the same city boundary as private decisions.');
});

test('native-shaped approval and archive batches preserve same-city administration', async () => {
  const id = 'native-batch', ownerId = 'review-member', uid = 'review-admin';
  const pending = validSubmission(ownerId);
  await seed({ [`businesses/${id}`]: pending });
  const approved = { ...pending, status: 'approved', hidden: false, approvedBy: uid,
    referrerReview: { status: 'confirmed', checkedBy: uid, checkedAt: new Date() } };
  const approval = await commit([
    { path: `businesses/${id}`, body: approved },
    { path: `publicBusinesses/${id}`, body: seedRecords()['publicBusinesses/example'] },
    { path: `businessContactRoutes/${id}`, body: { businessId: id, ownerUid: ownerId, active: true, updatedAt: new Date() } },
    { path: 'businessAudit/rules-approval', body: { businessId: id, actorId: uid, action: 'business.approved', createdAt: new Date() } },
  ], { uid });
  assert.equal(approval.status, 200, JSON.stringify(approval.data.error));
  const archive = await commit([
    { path: `businesses/${id}`, body: { ...approved, status: 'archived', hidden: true, archivedBy: uid, archivedAt: new Date() } },
    { path: `publicBusinesses/${id}`, remove: true },
    { path: `businessContactRoutes/${id}`, remove: true },
    { path: 'businessAudit/rules-archive', body: { businessId: id, actorId: uid, action: 'business.archived', createdAt: new Date() } },
  ], { uid });
  assert.equal(archive.status, 200, JSON.stringify(archive.data.error));
});

test('RELEASE GATE: inactive administrators cannot write public projections', async () => {
  await seed({ 'users/review-inactive-admin': { role: 'admin', adminCity: 'sydney', defaultCity: 'sydney', isActive: false } });
  assert.equal((await request('publicBusinesses/example', { uid: 'review-inactive-admin', method: 'PATCH', mask: ['name'], body: { name: 'Inactive admin attempt' } })).status, 403);
});

test('owner image resubmission supports legacy authority fields being absent and preserves present values', async () => {
  const legacy = validSubmission('review-member');
  delete legacy.tier; delete legacy.foundingMember;
  const complete = { ...validSubmission('review-member'), tier: 'featured', foundingMember: true, status: 'approved' };
  await seed({ 'businesses/legacy-image-edit': legacy, 'businesses/complete-image-edit': complete });
  const body = { name: 'Synthetic image resubmission', status: 'pending', abnVerified: false,
    referrerReview: { status: 'pending', checkedBy: '', checkedAt: null }, logoUrl: 'https://example.test/synthetic-image.jpg',
    logoPath: 'business-images/review-member/synthetic-image.jpg', updatedAt: new Date() };
  for (const id of ['legacy-image-edit', 'complete-image-edit']) {
    const result = await request(`businesses/${id}`, { uid: 'review-member', method: 'PATCH', mask: Object.keys(body), body });
    assert.equal(result.status, 200, JSON.stringify(result.data.error));
    if (id === 'legacy-image-edit') {
      assert.equal(result.data.fields.tier, undefined); assert.equal(result.data.fields.foundingMember, undefined);
    } else {
      assert.equal(result.data.fields.tier.stringValue, 'featured');
      assert.equal(result.data.fields.foundingMember.booleanValue, true);
    }
  }
});

test('legacy compatibility does not allow owner authority additions, changes, removals or cross-owner edits', async () => {
  const legacy = validSubmission('review-member'); delete legacy.tier; delete legacy.foundingMember;
  const complete = { ...validSubmission('review-member'), tier: 'featured', foundingMember: true };
  await seed({ 'businesses/legacy-authority': legacy, 'businesses/complete-authority': complete });
  const submission = { status: 'pending', abnVerified: false, referrerReview: { status: 'pending', checkedBy: '' } };
  for (const extra of [{ foundingMember: true }, { foundingMember: false }, { tier: 'free' }, { ownerId: 'review-customer' }]) {
    const body = { ...submission, ...extra };
    assert.equal((await request('businesses/legacy-authority', { uid: 'review-member', method: 'PATCH', mask: Object.keys(body), body })).status, 403);
  }
  for (const extra of [{ foundingMember: false }, { tier: 'free' }]) {
    const body = { ...submission, ...extra };
    assert.equal((await request('businesses/complete-authority', { uid: 'review-member', method: 'PATCH', mask: Object.keys(body), body })).status, 403);
  }
  assert.equal((await request('businesses/complete-authority', { uid: 'review-member', method: 'PATCH', body: { ...legacy, ...submission } })).status, 403);
  assert.equal((await request('businesses/legacy-authority', { uid: 'review-customer', method: 'PATCH', mask: Object.keys(submission), body: submission })).status, 403);
});
