import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { createStreamEventResolver, createStreamEventPublisher, streamEventCollection, streamEventData, assertStreamSession } from '../functions/stream-events.cjs';
import { recordingAdmin } from './firebase-integration/recordingAdmin.mjs';
import { eventActions } from '../src/utils/eventActions.mjs';

class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
const registration = { ownerUid:'host', city:'perth', timeZone:'Australia/Perth', status:'approved',
  title:'Public Workshop', eventType:'Workshop', date:'2026-12-01', suburb:'Perth', startTime:'18:00', endTime:'',
  privateDetails:{ address:'PRIVATE VENUE', poster:'PRIVATE POSTER', answers:'PRIVATE ANSWERS' }, address:{ fullAddress:'PRIVATE ADDRESS' } };
const source = readFileSync(new URL('../functions/index.js', import.meta.url), 'utf8');
function setup(changes = {}) {
  const state = recordingAdmin({
    'registrationEvents/shared':registration,
    'events/shared':{ createdByUserId:'host', metroArea:'perth', eventDate:'2026-12-01', eventType:'Legacy', hostName:'Example host' },
    'users/host':{ role:'member', isActive:true },
    'users/admin':{ role:'admin', adminCity:'perth' },
    'users/defaultAdmin':{ role:'admin', defaultCity:'perth' },
    'users/otherAdmin':{ role:'admin', adminCity:'sydney' },
    'users/super':{ role:'superAdmin' },
    'users/attendee':{ role:'member' },
    ...changes,
  });
  const collection = state.db.collection;
  const wrapRef = ref => ({
    ...ref, parent:{ id:ref.path.split('/').at(-2) },
    async get() { const snap = await ref.get(); return { ...snap, ref:wrapRef(ref) }; },
    async update(fields) { await state.db.runTransaction(async tx => { tx.update(ref, fields); }); },
  });
  state.db.collection = name => {
    const wrapQuery = query => ({
      ...query, doc:id => wrapRef(query.doc(id)),
      where:(...args) => wrapQuery(query.where(...args)),
      async get() { const snap = await query.get(); return { ...snap, docs:snap.docs.map(doc => ({ ...doc, ref:wrapRef(doc.ref) })) }; },
    });
    return wrapQuery(collection(name));
  };
  const adminCanAccessEvent = (user, event) => user.role === 'superAdmin' || user.role === 'admin' && user.adminCity === event.metroArea;
  const resolveStreamEvent = createStreamEventResolver({ ...state, HttpsError, adminCanAccessEvent });
  const captures = { thumbnails:[], email:[], completed:[] };
  const context = {
    exports:{}, ...state, HttpsError, adminCanAccessEvent, resolveStreamEvent, streamEventCollection, streamEventData, assertStreamSession,
    publishStreamEvent:createStreamEventPublisher({ ...state, HttpsError }),
    REGION:'test', YOUTUBE_CLIENT_ID:0, YOUTUBE_CLIENT_SECRET:0, SMTP_HOST:0, SMTP_PORT:0, SMTP_USER:0, SMTP_PASS:0, EMAIL_FROM:0,
    crypto, URL, AbortSignal, process:{ env:{} }, console:{ log(){}, warn(){}, error(){} },
    onCall:(_options, callback) => callback,
    getYouTubeAccessToken:async () => 'synthetic-access',
    createYouTubeBroadcast:async (_token, title, privacy) => ({ rtmpsUrl:'rtmps://example.invalid/live', streamKey:'synthetic-key',
      watchUrl:'https://www.youtube.com/watch?v=abcdefghijk', broadcastId:'abcdefghijk', title, privacy }),
    setStreamThumbnailForVideo:async data => { captures.thumbnails.push(data); },
    sendPrivateStreamLinkToHost:async data => { captures.email.push(data); return { sent:true }; },
    completeYouTubeBroadcastIfLive:async id => { captures.completed.push(id); },
    markStreamVideoCompleted:async id => { captures.completed.push(id); },
    catalogPublicYouTubeChannelVideos:async () => {},
    syncStreamVideoAvailability:async () => {},
    fetch:async () => ({ ok:true, json:async () => ({ title:'Synthetic YouTube video', items:[{ status:{ lifeCycleStatus:'complete' } }] }) }),
  };
  vm.runInNewContext(source.slice(source.indexOf('exports.nativeStreamStart =')), context);
  vm.runInNewContext(source.slice(source.indexOf('exports.listStreamVideos ='), source.indexOf('exports.refreshStreamVideoThumbnails =')), context);
  vm.runInNewContext(source.slice(source.indexOf('async function runStaleLiveCleanup()'), source.indexOf('// Named differently')), context);
  const request = (data = {}, uid = 'host') => ({ auth:{ uid, token:{ firebase:{ sign_in_provider:'phone' } } },
    data:{ eventId:'shared', eventCollection:'registrationEvents', ...data } });
  return { ...state, api:context.exports, resolveStreamEvent, request, captures, cleanup:context.runStaleLiveCleanup };
}

test('registration streaming resolves explicit collection and uses only public metadata', async () => {
  const state = setup();
  const result = await state.resolveStreamEvent(state.request());
  assert.equal(result.ref.path, 'registrationEvents/shared');
  assert.equal(result.data.eventSubject, 'Public Workshop');
  assert.deepEqual(result.data.address, { suburb:'Perth' });
  assert.equal(JSON.stringify(result.data).includes('PRIVATE'), false);
  assert.equal((await state.resolveStreamEvent(state.request({ eventCollection:undefined }))).data.eventType, 'Legacy');
  for (const eventCollection of ['users', '', null]) await assert.rejects(state.resolveStreamEvent(state.request({ eventCollection })));
  await assert.rejects(state.resolveStreamEvent(state.request({ eventId:'bad/path' })));
});

test('registration streams require approved available events and an active owner or city-scoped admin', async () => {
  const state = setup();
  for (const uid of ['host', 'admin', 'defaultAdmin', 'super']) await state.resolveStreamEvent(state.request({}, uid));
  for (const uid of ['attendee', 'otherAdmin']) await assert.rejects(state.resolveStreamEvent(state.request({}, uid)), error => error.code === 'permission-denied');
  for (const changes of [{ status:'pending' }, { status:'cancelled' }, { deletedAt:'now' }, { hidden:true }]) {
    state.records.set('registrationEvents/shared', { ...registration, ...changes });
    await assert.rejects(state.resolveStreamEvent(state.request()), error => error.code === 'failed-precondition');
    await state.resolveStreamEvent(state.request(), { allowInactive:true });
  }
  state.records.set('registrationEvents/shared', registration);
  for (const profile of [{ isActive:false }, { bannedAt:'now' }, { archivedAt:'now' }, { accountDeletedAt:'now' },
    ...['inactive','banned','deleted','archived','suspended'].map(accountStatus => ({ accountStatus }))]) {
    state.records.set('users/host', profile);
    await assert.rejects(state.resolveStreamEvent(state.request()));
  }
  const guest = state.request(); guest.auth.token.firebase.sign_in_provider = 'anonymous';
  await assert.rejects(state.resolveStreamEvent(guest), error => error.code === 'unauthenticated');
});

test('actual native start publishes only registration state, public or unlisted as selected', async () => {
  for (const privacyStatus of ['public', 'unlisted']) {
    const state = setup();
    const result = await state.api.nativeStreamStart(state.request({ useOAuth:true, protocolVersion:2, privacyStatus, eventTitle:'PRIVATE forged title' }));
    const event = state.records.get('registrationEvents/shared');
    const session = state.records.get('nativeStreamSessions/' + result.sessionId);
    const video = state.records.get('streamVideos/abcdefghijk');
    assert.equal(state.records.get('events/shared').isLive, undefined);
    assert.equal(event.isLive, true);
    assert.equal(event.liveWatchUrl, privacyStatus === 'public' ? result.watchUrl : null);
    assert.equal(session.eventCollection, 'registrationEvents');
    assert.equal(video.eventCollection, 'registrationEvents');
    assert.equal(video.eventTitle, 'Public Workshop');
    assert.equal(video.suburb, 'Perth');
    assert.equal(JSON.stringify({ video, thumbnail:state.captures.thumbnails }).includes('PRIVATE'), false);
    const email = await state.api.sendPrivateStreamLinkEmail({ ...state.request(), data:{ sessionId:result.sessionId } });
    assert.equal(email.reason, 'registration-delivery-disabled');
    assert.equal(state.captures.email.length, 0);
    await state.api.nativeStreamResume(state.request({ sessionId:result.sessionId }));
    await state.api.nativeStreamCheckHealth(state.request({ sessionId:result.sessionId }));
    await assert.rejects(state.api.nativeStreamCheckHealth(state.request({ sessionId:result.sessionId }, 'attendee')));
    await assert.rejects(state.api.nativeStreamResume(state.request({ sessionId:result.sessionId, eventCollection:'events' })));
    await assert.rejects(state.api.nativeStreamEndEvent(state.request({ sessionId:result.sessionId, eventCollection:'events' })));
    assert.equal(state.records.get('events/shared').isLive, undefined);
    state.records.get('registrationEvents/shared').deletedAt = 'now';
    await state.api.nativeStreamEndEvent(state.request({ sessionId:result.sessionId }));
    assert.equal(state.records.get('registrationEvents/shared').isLive, false);
    assert.equal(state.records.get('nativeStreamSessions/' + result.sessionId).status, 'stopped');
  }
});

test('actual external streaming uses namespaced records and registration-aware stop without private metadata', async () => {
  for (const privacyStatus of ['public', 'unlisted']) {
    const state = setup();
    await state.api.startExternalYouTubeStream(state.request({ youtubeUrl:'https://youtu.be/abcdefghijk', privacyStatus }));
    const video = state.records.get('streamVideos/external_abcdefghijk_registration_shared');
    assert.equal(video.eventCollection, 'registrationEvents');
    assert.equal(JSON.stringify({ video, thumbnail:state.captures.thumbnails }).includes('PRIVATE'), false);
    assert.equal(state.records.get('events/shared').isLive, undefined);
    assert.equal(state.records.get('registrationEvents/shared').liveWatchUrl, privacyStatus === 'public' ? video.watchUrl : null);
    assert.equal(state.captures.email.length, 0);
    const controls = await state.api.getEventStream(state.request());
    assert.equal(controls.watchUrl, video.watchUrl);
    await assert.rejects(state.api.getEventStream(state.request({}, 'attendee')));
    state.records.get('streamVideos/external_abcdefghijk_registration_shared').watchUrl = null;
    await assert.rejects(state.api.getEventStream(state.request()), /valid video link/);
    assert.equal(await state.cleanup(), 0, 'A healthy external stream is not a missing native session');
    await state.api.endExternalYouTubeStream(state.request());
    assert.equal(state.records.get('registrationEvents/shared').isLive, false);
  }
});

test('legacy callers without discriminator retain native start and stop behavior', async () => {
  const state = setup();
  const result = await state.api.nativeStreamStart(state.request({ eventCollection:undefined, useOAuth:true, protocolVersion:2 }));
  assert.equal(state.records.get('events/shared').isLive, true);
  assert.equal(state.records.get('registrationEvents/shared').isLive, undefined);
  await state.api.nativeStreamEndEvent(state.request({ eventCollection:undefined, sessionId:result.sessionId }));
  assert.equal(state.records.get('events/shared').isLive, false);
});

test('archive backfill retains registration identity and unlisted privacy without private event fields', async () => {
  for (const privacyStatus of ['public', 'unlisted']) {
    const state = setup();
    await state.api.nativeStreamStart(state.request({ useOAuth:true, protocolVersion:2, privacyStatus }));
    state.records.delete('streamVideos/abcdefghijk');
    const guest = await state.api.listStreamVideos({ data:{} });
    const video = state.records.get('streamVideos/abcdefghijk');
    assert.equal(video.eventCollection, 'registrationEvents');
    assert.equal(JSON.stringify(video).includes('PRIVATE'), false);
    assert.equal(video.appVisibility, privacyStatus === 'public' ? 'public' : 'private');
    assert.equal(guest.videos.length, privacyStatus === 'public' ? 1 : 0);
    if (privacyStatus === 'public') {
      assert.equal(guest.videos[0].eventCollection, 'registrationEvents');
      assert.equal(guest.videos[0].watchUrl, undefined);
      assert.equal(guest.videos[0].videoId, undefined);
    }
  }
});

test('publication rechecks approval, deletion and concurrent stream state transactionally', async () => {
  for (const change of [{ status:'pending' }, { deletedAt:'now' }, { isLive:true }]) {
    const state = setup();
    const resolved = await state.resolveStreamEvent(state.request());
    state.records.set('registrationEvents/shared', { ...registration, ...change });
    const publish = createStreamEventPublisher({ ...state, HttpsError });
    await assert.rejects(publish(resolved.ref, resolved.collection, { isLive:true, liveUrl:'new-session' }),
      error => error.code === 'failed-precondition');
    assert.equal(state.records.get('registrationEvents/shared').liveUrl, undefined);
  }
});

test('stale cleanup includes cancelled registrations and closes their native session', async () => {
  const state = setup();
  const result = await state.api.nativeStreamStart(state.request({ useOAuth:true, protocolVersion:2 }));
  state.records.get('registrationEvents/shared').status = 'cancelled';
  assert.equal(await state.cleanup(), 1);
  assert.equal(state.records.get('registrationEvents/shared').isLive, false);
  assert.equal(state.records.get('nativeStreamSessions/' + result.sessionId).status, 'stopped');
});

test('registration card exposes normal live management and only public viewing shortcuts', () => {
  const actions = (event, manage = false) => eventActions({ event:{ registrationOnly:true, status:'approved', ...event },
    member:true, manage, handlers:{ live(){} } }).find(action => action.id === 'live');
  assert.equal(actions({}, true).disabled, false);
  assert.equal(actions({ status:'pending' }, true).disabled, true);
  assert.equal(actions({ isLive:true, liveWatchUrl:'https://youtu.be/abcdefghijk', liveAppVisibility:'public' }).disabled, false);
  assert.equal(actions({ isLive:true, liveWatchUrl:'https://youtu.be/abcdefghijk', liveAppVisibility:'public' }, true).label, 'Manage Live');
  assert.equal(actions({ isLive:true, liveAppVisibility:'private' }).disabled, true);
  assert.equal(actions({ isLive:true, liveAppVisibility:'private' }, true).disabled, false);
});

test('hidden registration streams deny administrative actions even in recovery mode',async()=>{
 const state=setup();state.records.set('registrationEvents/shared',{...registration,hidden:true});
 for(const uid of ['admin','defaultAdmin','super'])await assert.rejects(state.resolveStreamEvent(state.request({},uid),{allowInactive:true}),error=>error.code==='permission-denied');
 await state.resolveStreamEvent(state.request(),{allowInactive:true});
});
