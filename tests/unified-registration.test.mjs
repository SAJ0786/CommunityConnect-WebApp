import test from 'node:test';
import assert from 'node:assert/strict';
import { registrationEventCard, registrationEventPages, mergePublicEvents } from '../src/registration/eventFeed.mjs';
import { createRegistrationClient } from '../src/registration/registrationClient.mjs';
import { eventActions } from '../src/utils/eventActions.mjs';
import { eventDraftFromDetail, validateRegistrationDraft } from '../src/registration/registrationViewModel.mjs';
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
