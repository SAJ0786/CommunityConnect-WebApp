import test from 'node:test';
import assert from 'node:assert/strict';
import { registrationEventCard, registrationEventPages, mergePublicEvents } from '../src/registration/eventFeed.mjs';
import { createRegistrationClient } from '../src/registration/registrationClient.mjs';
import { eventActions } from '../src/utils/eventActions.mjs';
import { eventDraftFromDetail, validateRegistrationDraft, registrantName, registrationEventForm, registrationDraftFromEventForm, registrationReviewDetail } from '../src/registration/registrationViewModel.mjs';
import { createDraft } from '../src/registration/prototypeModel.mjs';
import { eventExploreItems } from '../src/utils/navigation.mjs';

test('registration cards preserve normal city/date ordering fields without private poster or address', () => {
  const card = registrationEventCard({ id:'reg', date:'2026-12-01', city:'perth', title:'Workshop', eventType:'Custom', customEventType:'Workshop', suburb:'Perth', ownerUid:'host', status:'approved' });
  assert.equal(card.eventDate, '2026-12-01');
  assert.equal(card.metroArea, 'perth');
  assert.equal(card.createdByUserId, 'host');
  assert.equal(card.registrationOnly, true);
  assert.equal(card.imageUrl, '');
  assert.deepEqual(card.address, { suburb:'Perth' });
  assert.equal(card.startTime, undefined, 'No made-up start time');
});
test('public registration feed consumes empty scan pages and deduplicates, never exposing pending or deleted rows', async () => {
  const calls = [];
  const api = { list: async options => {
    calls.push(options);
    return options.cursor === null ? { events:[], nextCursor:'second' }
      : options.cursor === 'second' ? { events:[{ id:'approved', status:'approved' },{ id:'pending', status:'pending' }], nextCursor:'third' }
      : { events:[{ id:'approved', status:'approved', revision:2 },{ id:'deleted', status:'approved', deletedAt:'now' }], nextCursor:null };
  } };
  const rows = await registrationEventPages(api, { scope:'public', city:'sydney' });
  assert.deepEqual(calls.map(call => call.cursor), [null, 'second', 'third']);
  assert.deepEqual(mergePublicEvents([{ id:'ordinary' }], rows).map(row => row.id), ['ordinary', 'approved']);
  assert.equal(rows.find(row => row.id === 'approved').revision, 2);
  await assert.rejects(registrationEventPages({ list:async () => ({ events:[], nextCursor:'repeat' }) }, {}), /repeated a cursor/);
});
test('global approval requests omit city and deletion is the revision-checked safe delete API', async () => {
  const calls = [];
  const api = createRegistrationClient(async (name, data) => { calls.push({ name, data }); return { data:{ events:[] } }; }, { enabled:true });
  await api.list({ scope:'review' });
  await api.deleteEvent('reg', 4);
  assert.deepEqual(calls, [
    { name:'listRegistrationEvents', data:{ scope:'review', cursor:null } },
    { name:'deleteRegistrationEvent', data:{ eventId:'reg', expectedRevision:4, confirmation:'DELETE EVENT' } },
  ]);
  assert.equal(eventExploreItems.some(item => item.key === 'registration'), false);
});
test('normal card registration shortcuts distinguish guests, attendees and hosts', () => {
  const handlers = Object.fromEntries(['register','editForm','responses','edit','delete','directions'].map(id => [id, () => {}]));
  const base = { event:{ registrationOnly:true, status:'approved', address:{ suburb:'Parramatta' } }, member:false, manage:false, admin:false, readOnly:false, handlers };
  const actions = options => eventActions({ ...base, ...options });
  assert.equal(actions({}).find(action => action.id === 'register').disabled, false, 'Guests can request sign-in');
  assert.equal(actions({}).find(action => action.id === 'directions').disabled, true);
  assert.equal(actions({ event:{ ...base.event, isRegistered:true }, member:true }).find(action => action.id === 'register').label, 'Edit registrations');
  const host = actions({ member:true, manage:true });
  assert.ok(host.find(action => action.id === 'editForm' && !action.disabled));
  assert.ok(host.find(action => action.id === 'responses' && !action.disabled));
  assert.equal(host.some(action => /Cancel whole/i.test(action.label)), false);
  assert.equal(actions({ event:{ ...base.event, status:'pending' } }).find(action => action.id === 'register').disabled, true);
});
test('registration editor preserves exact optional schedule including overnight events', () => {
  const detail = { canManage:true, event:{ title:'Event', date:'2026-12-01', eventType:'Workshop', startTime:'23:00', endTime:'01:00' }, privateDetails:{ address:'1 Fictional Street' }, form:{ purpose:'Planning', fields:[] } };
  const draft = eventDraftFromDetail(detail, ['Workshop']);
  assert.equal(draft.startTime, '23:00'); assert.equal(draft.endTime, '01:00');
  const valid = { ...createDraft(), date:'2026-12-01', suburb:'Parramatta', address:'1 Fictional Street', startTime:'23:00', endTime:'01:00' };
  assert.deepEqual(validateRegistrationDraft(valid), []);
  assert.ok(validateRegistrationDraft({ ...valid, startTime:'' }).some(error => error.includes('End time')));
  assert.ok(validateRegistrationDraft({ ...valid, endTime:'23:00' }).some(error => error.includes('End time')));
  assert.ok(validateRegistrationDraft({ ...valid, startTime:'25:00' }).some(error => error.includes('HH:mm')));
});
test('response names come from participant answers, never booking IDs or guardian contact fields', () => {
  const row = { registrationId:'opaque-reference', fields:[
    { id:'guardian', type:'text', label:'Parent/ Guardian Name' },
    { id:'participant', type:'text', label:'Name of Participant' },
  ], answers:{ guardian:'Example guardian', participant:'Example participant' } };
  assert.equal(registrantName(row), 'Example participant');
  assert.equal(registrantName({ ...row, fields:row.fields.slice(0, 1) }), 'Registrant name unavailable');
  assert.equal(registrantName({ fields:[], answers:{} }), 'Registrant name unavailable');
});
test('shared normal-event fields round trip through registration drafts without public poster paths or forged instants', () => {
  const draft = { ...createDraft(), title:'Workshop', hostName:'Example host', hostPhone:'0400000000', hostContactOptional:'host@example.test',
    date:'2026-12-01', startTime:'18:30', endTime:'', eventSubject:'Example subject', audienceType:'Ladies only',
    organiserType:'centre', organiserName:'Example centre', isOnBehalfOf:true, speakerName:'Speaker', reciters:[{ type:'Reciter', name:'Reader' }],
    venue:{ fullAddress:'Private venue', suburb:'Parramatta', latitude:-33.8, longitude:151 }, timeMode:'manual' };
  const form = registrationEventForm(draft);
  const restored = registrationDraftFromEventForm(draft, { ...form, imageUrl:'public-url-not-allowed', imagePath:'public-path', startAt:'forged' });
  for (const key of ['hostName','hostPhone','hostContactOptional','startTime','endTime','eventSubject','audienceType','organiserType','speakerName']) assert.equal(restored[key], draft[key], key);
  assert.deepEqual(restored.reciters, draft.reciters);assert.equal(restored.imageUrl, undefined);assert.equal(restored.startAt, undefined);
  const card = registrationEventCard({ ...draft, id:'event', city:'sydney' });
  assert.equal(card.startTime,'18:30');assert.equal(card.hostName,'Example host');assert.equal(card.organiserType,'centre');
});
test('card approval shortcut is visible to admin surfaces and enabled only by pending server capability', () => {
  const base = { registrationOnly:true, showApproval:true, status:'pending', canApprove:true };
  const approval = event => eventActions({ event, member:true, manage:true, admin:true, handlers:{approve(){}} }).find(action => action.id === 'approve');
  assert.equal(approval(base).disabled,false);
  assert.equal(approval({ ...base, status:'approved', canApprove:false }).disabled,true);
  assert.equal(approval({ ...base, status:'approved', hasPendingChanges:true }).disabled,false);
  assert.match(approval({ ...base, status:'approved', canApprove:false }).reason,/already approved/);
  assert.equal(approval({ ...base, canApprove:false }).disabled,true);
  assert.equal(approval({ ...base, deletedAt:'now' }).disabled,true);
});
test('pending snapshot selection is manager-only and never mutates published detail', () => {
  const published={event:{title:'Published',revision:3},form:{version:1},privateDetails:{address:'Published venue'},
    pendingChanges:{event:{title:'Submitted',revision:3},form:{version:1},privateDetails:{address:'Submitted venue'}}};
  assert.equal(registrationReviewDetail(published).event.title,'Published');
  const manager={...published,canManage:true};
  assert.equal(registrationReviewDetail(manager).event.title,'Submitted');assert.equal(manager.event.title,'Published');
});
test('poster API only opts into pending view explicitly; default remains published', async () => {
  const calls=[];
  const api=createRegistrationClient(async(name,data)=>{calls.push({name,data});return {data:{}};},{enabled:true});
  await api.poster('event');await api.poster('event','pending');
  assert.throws(()=>api.poster('event','draft'),/Unsupported/);
  assert.deepEqual(calls,[{name:'getRegistrationPoster',data:{eventId:'event'}},{name:'getRegistrationPoster',data:{eventId:'event',view:'pending'}}]);
});

test('registration pages become visible before the following page resolves', async () => {
  let release;
  const pages = [];
  const api = { list: async ({ cursor }) => cursor ? new Promise(resolve => { release = resolve; }) : { events: [{ id:'first',date:'2026-12-01',city:'sydney' }], nextCursor:'next' } };
  const pending = registrationEventPages(api, {scope:'management',city:'sydney'}, rows => pages.push(rows.map(row=>row.id)));
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(pages, [['first']]);
  release({events:[{id:'second',date:'2026-12-02',city:'sydney'}],nextCursor:null});
  assert.equal((await pending).length,2);
  assert.deepEqual(pages,[['first'],['first','second']]);
});

test('review feedback uses the authorised callable with optimistic revision', async () => {
  const calls = [];
  const api = createRegistrationClient(async (name,data)=>{calls.push({name,data});return {data:{ok:true}};},{enabled:true});
  await api.review('event',7,'changes-requested','Please confirm start time');
  assert.deepEqual(calls,[{name:'reviewRegistrationEvent',data:{eventId:'event',expectedRevision:7,decision:'changes-requested',feedback:'Please confirm start time'}}]);
});
