import test from 'node:test';
import assert from 'node:assert/strict';
import { eventStartAt, createReminderHandlers } from './firebase-integration/functions/event-reminders.cjs';
import { recordingAdmin } from './firebase-integration/recordingAdmin.mjs';
import { createReminderSweep, createReminderTransport, register } from '../functions/web-event-reminder-schedule.cjs';
class HttpsError extends Error { constructor(code,message){super(message);this.code=code;} }
const event={eventDate:'2026-10-12',startTime:'18:00',metroArea:'sydney',status:'active',hostName:'Example'};
const deviceId='synthetic-browser-1234', token='synthetic-token';
function setup() {
  let clock=Date.parse('2026-10-12T06:00:00Z');
  const state=recordingAdmin({'users/member':{isActive:true,pushNotificationsEnabled:true,fcmTokens:{[token]:{source:'web'}}},'events/example':event});
  const api=createReminderHandlers({...state,HttpsError,now:()=>clock});
  const request=(data={},uid='member')=>({auth:{uid,token:{firebase:{sign_in_provider:'phone'}}},data:{eventId:'example',deviceId,...data}});
  return {...state,api,request,tick:value=>{clock=value;},record:()=>[...state.records.keys()].find(key=>key.startsWith('webEventReminders/'))};
}
test('reminder timestamps use Australian event timezone, strict dates and reject ambiguous DST times',()=>{
  assert.equal(eventStartAt(event),Date.parse('2026-10-12T07:00:00Z'));
  assert.equal(eventStartAt({...event,metroArea:'perth'}),Date.parse('2026-10-12T10:00:00Z'));
  assert.equal(eventStartAt({...event,startTime:'6:00 PM'}),eventStartAt(event));
  for(const change of [{eventDate:'2026-02-30'},{startTime:'25:00'},{eventDate:'2026-10-04',startTime:'02:30'},{eventDate:'2026-04-05',startTime:'02:30'}]) assert.throws(()=>eventStartAt({...event,...change}));
});
test('reminders persist across handler instances, retries are idempotent and replacing/cancelling is durable',async()=>{
  const state=setup(), request=state.request({minutesBefore:30,token});
  const first=await state.api.set(request); assert.equal(first.reminder.status,'pending');
  const second=createReminderHandlers({...state,HttpsError,now:()=>Date.parse('2026-10-12T06:00:00Z')});
  assert.deepEqual(await second.get(request),first);
  await second.set(request); assert.equal(state.records.get(state.record()).revision,1);
  await second.set(state.request({minutesBefore:15,token})); assert.equal(state.records.get(state.record()).revision,2);
  await second.remove(request); assert.equal((await second.get(request)).reminder.status,'cancelled');
});
test('registration reminders resolve only approved registration records and exact backend UTC schedule',async()=>{
  const state=setup();
  state.records.set('registrationEvents/registration',{status:'approved',date:'2026-10-12',startTime:'18:00',startAt:'2026-10-12T07:00:00Z',title:'Workshop',privateDetails:{address:'PRIVATE'}});
  const request=state.request({eventId:'registration',eventCollection:'registrationEvents',minutesBefore:30,token});
  const result=await state.api.set(request);
  assert.equal(result.reminder.eventStartAt,Date.parse('2026-10-12T07:00:00Z'));
  assert.equal(state.records.get(state.record()).eventCollection,'registrationEvents');
  assert.equal((await state.api.get(state.request({eventId:'registration'}))).reminder,null,'Collections cannot collide');
  state.tick(Date.parse('2026-10-12T06:31:00Z'));
  const sent=[]; await state.api.process(state.record().split('/')[1],async payload=>sent.push(payload));
  assert.equal(sent.length,1); assert.equal(sent[0].body,'Workshop');
  assert.equal(JSON.stringify(sent).includes('PRIVATE'),false);
});
test('pending, deleted and date-only registrations cannot schedule reminders or use invented times',async()=>{
  for(const changes of [{status:'pending'},{deletedAt:'now'},{startTime:'',startAt:null}]) {
    const state=setup();
    state.records.set('registrationEvents/registration',{status:'approved',startTime:'18:00',startAt:'2026-10-12T07:00:00Z',...changes});
    await assert.rejects(state.api.set(state.request({eventId:'registration',eventCollection:'registrationEvents',minutesBefore:30,token})));
    assert.equal(state.record(),undefined);
  }
  const state=setup();
  await assert.rejects(state.api.set(state.request({eventCollection:'users',minutesBefore:30,token})),/Unsupported/);
});
test('registration cancellation, deletion and schedule changes are rechecked by reminder worker',async()=>{
  for(const mode of ['cancelled','deleted','rescheduled']) {
    const state=setup(), id='registration';
    state.records.set('registrationEvents/'+id,{status:'approved',startTime:'18:00',startAt:'2026-10-12T07:00:00Z'});
    await state.api.set(state.request({eventId:id,eventCollection:'registrationEvents',minutesBefore:30,token}));
    if(mode==='deleted')state.records.delete('registrationEvents/'+id);
    else if(mode==='cancelled')state.records.get('registrationEvents/'+id).status='cancelled';
    else state.records.get('registrationEvents/'+id).startAt='2026-10-12T08:00:00Z';
    state.tick(Date.parse('2026-10-12T06:31:00Z'));
    let sent=0;await state.api.process(state.record().split('/')[1],async()=>sent++);
    assert.equal(sent,0);
    assert.equal(state.records.get(state.record()).status,mode==='rescheduled'?'pending':'cancelled');
  }
});
test('invalid, past, inactive, unavailable and unregistered-token reminder requests do not save',async()=>{
  for(const mode of ['past','inactive','hidden','token','anonymous']) {
    const state=setup();
    const request=state.request({minutesBefore:mode==='past'?60:30,token:mode==='token'?'unknown':token});
    if(mode==='inactive')state.records.get('users/member').isActive=false;
    if(mode==='hidden')state.records.get('events/example').hidden=true;
    if(mode==='anonymous')request.auth.token.firebase.sign_in_provider='anonymous';
    await assert.rejects(state.api.set(request)); assert.equal(state.record(),undefined);
  }
});
test('due processing sends only once, using the saved token, and exposes no token in its read response',async()=>{
  const state=setup(), sent=[];
  await state.api.set(state.request({minutesBefore:30,token})); state.tick(Date.parse('2026-10-12T06:31:00Z'));
  const id=state.record().split('/')[1];
  await state.api.process(id,async payload=>sent.push(payload));
  await state.api.process(id,async payload=>sent.push(payload));
  assert.equal(sent.length,1); assert.equal(sent[0].token,token);
  const result=await state.api.get(state.request());
  assert.equal(result.reminder.status,'sent'); assert.equal(JSON.stringify(result).includes(token),false);
});
test('cancelled reminders, deleted events and revoked notification permission cannot dispatch',async()=>{
  for(const mode of ['cancel','event','permission']) {
    const state=setup(); await state.api.set(state.request({minutesBefore:30,token}));
    if(mode==='cancel')await state.api.remove(state.request());
    if(mode==='event')state.records.delete('events/example');
    if(mode==='permission')state.records.get('users/member').pushNotificationsEnabled=false;
    state.tick(Date.parse('2026-10-12T06:31:00Z'));
    let sent=0; await state.api.process(state.record().split('/')[1],async()=>sent++);
    assert.equal(sent,0);
  }
});
test('rescheduled events defer delivery; uncertain delivery is recorded without automatic duplicates',async()=>{
  const state=setup(); await state.api.set(state.request({minutesBefore:30,token})); const id=state.record().split('/')[1];
  state.records.set('events/example',{...event,startTime:'19:00'}); state.tick(Date.parse('2026-10-12T06:31:00Z'));
  let count=0; await state.api.process(id,async()=>count++); assert.equal(count,0);
  state.tick(Date.parse('2026-10-12T07:31:00Z'));
  await state.api.process(id,async()=>{count++;throw new Error('Network response lost');});
  assert.equal(state.records.get(state.record()).status,'delivery-unconfirmed');
  await state.api.process(id,async()=>count++); assert.equal(count,1);
});

test('scheduler bounds each sweep, resumes without starvation and revisits events moved earlier',async()=>{
  const state=setup();
  for(let i=0;i<5;i++) await state.api.set(state.request({deviceId:'synthetic-browser-'+i+'1234',minutesBefore:30,token}));
  state.tick(Date.parse('2026-10-12T06:31:00Z'));
  let sent=0;
  const sweep=createReminderSweep({...state,FieldPath:{documentId:()=>'__name__'},handlers:state.api,
    deliver:async()=>{sent++;},pageSize:2,maxRecords:2});
  assert.equal((await sweep()).examined,2); assert.equal(sent,2);
  await sweep(); await sweep(); assert.equal(sent,5);
  await sweep(); assert.equal(sent,5);
  const pending=setup();
  for(let i=0;i<5;i++) await pending.api.set(pending.request({deviceId:'synthetic-browser-'+i+'1234',minutesBefore:30,token}));
  const pendingSweep=createReminderSweep({...pending,FieldPath:{documentId:()=>'__name__'},handlers:pending.api,deliver:async()=>{},pageSize:100,maxRecords:2});
  assert.equal((await pendingSweep()).continuing,true);
  const firstCursor=pending.records.get('webReminderWorkerState/sweep').cursor;
  assert.equal((await pendingSweep()).continuing,true);
  assert.notEqual(pending.records.get('webReminderWorkerState/sweep').cursor,firstCursor);
  const moved=setup(); await moved.api.set(moved.request({minutesBefore:30,token}));
  moved.records.set('events/example',{...event,startTime:'17:45'});
  moved.tick(Date.parse('2026-10-12T06:16:00Z'));
  await createReminderSweep({...moved,FieldPath:{documentId:()=>'__name__'},handlers:moved.api,deliver:async()=>sent++})();
  assert.equal(sent,6);
});

test('a crashed dispatch is marked unconfirmed and never automatically sent twice',async()=>{
  const state=setup(); await state.api.set(state.request({minutesBefore:30,token}));
  Object.assign(state.records.get(state.record()),{status:'dispatching',updatedAt:Date.parse('2026-10-12T06:15:00Z')});
  state.tick(Date.parse('2026-10-12T06:31:00Z'));
  await state.api.process(state.record().split('/')[1],async()=>assert.fail('Must not resend'));
  assert.equal(state.records.get(state.record()).status,'delivery-unconfirmed');
});

test('FCM candidate uses data-only web payload, bounded TTL and requires explicit registration',async()=>{
  let sent;
  await createReminderTransport({send:async payload=>{sent=payload;}})({token:'synthetic',title:'Event reminder',body:'Example',tag:'stable-revision',eventId:'an event & more',ttlSeconds:7200});
  assert.equal(sent.notification,undefined); assert.equal(sent.webpush.headers.TTL,'3600');
  assert.equal(sent.data.url,'/?event=an%20event%20%26%20more');
  assert.throws(()=>register({}),/explicit backend activation/);
});
