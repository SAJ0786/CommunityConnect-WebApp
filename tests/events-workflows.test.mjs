import test from 'node:test';
import assert from 'node:assert/strict';
import { recordingFirestore } from './firebase-integration/recordingFirestore.mjs';
import { createHostMessaging } from '../src/services/hostMessaging.mjs';
import { createEventSeriesEditor } from '../src/services/eventSeriesEdit.mjs';
import { generateGregorianOccurrences, generateHijriOccurrences } from '../src/services/recurrenceService.js';
const future = { eventDate:'2099-10-12', startTime:'18:00', status:'active', seriesId:'series', createdByUserId:'owner', metroArea:'sydney', notes:'Original' };
function setup(options = {}) {
  const store = recordingFirestore({
    'users/viewer': { fullName:'Visitor', isActive:true },
    'users/owner': { fullName:'Host', isActive:true },
    'users/admin': { fullName:'Admin', role:'admin', adminCity:'sydney', isActive:true },
    'events/first':future, 'events/legacy':{...future,seriesId:null,recurringSeriesId:'series'},
    'events/past':{...future,eventDate:'2000-01-01'}, 'events/live':{...future,isLive:true},
  });
  let user = { uid:'viewer' };
  const common = { db:{},sdk:store.sdk,currentUser:()=>user,...options };
  const host = createHostMessaging(common);
  const editor = createEventSeriesEditor({ ...common,
    canEdit:(profile,event,uid)=>event.createdByUserId === uid || profile.role === 'admin' && event.metroArea === profile.adminCity,
    prepareFields:updates=>updates });
  return { ...store,host,editor,login:uid=>{user={uid};} };
}
test('Contact Host writes native private thread/message shapes and reuses the thread for later sends',async()=>{
  const state = setup();
  const {threadId}=await state.host.send('first','  Hello host  ');
  const thread=state.records.get('hostMessageThreads/'+threadId);
  assert.deepEqual(thread.participantUids,['viewer','owner']);
  assert.equal(thread.senderName,'Visitor'); assert.equal(thread.hostUid,'owner');
  const created=thread.createdAt;
  assert.equal((await state.host.send('first','Second message')).threadId,threadId);
  assert.deepEqual(state.records.get('hostMessageThreads/'+threadId).createdAt,created);
  const messages=[...state.records].filter(([key])=>key.startsWith('hostMessageThreads/'+threadId+'/messages/'));
  assert.equal(messages.length,2); assert.equal(messages[0][1].text,'Hello host');
});
test('Contact Host denies self, inactive, hidden, anonymous and read-only submissions without writes',async()=>{
  const readonly=setup({readOnly:true});
  await assert.rejects(readonly.host.send('first','Test'),/read-only/); assert.equal(readonly.writes.length,0);
  for(const mode of ['self','inactive','hidden','anonymous']) {
    const state=setup();
    if(mode==='self')state.login('owner');
    if(mode==='inactive')state.records.get('users/viewer').isActive=false;
    if(mode==='hidden')state.records.get('events/first').hidden=true;
    if(mode==='anonymous')state.login('');
    await assert.rejects(state.host.send('first','Test')); assert.equal(state.writes.length,0);
  }
});
test('host replies and read receipts require participation; administration alone grants no access',async()=>{
  const state=setup(), {threadId}=await state.host.send('first','Question');
  state.login('admin');
  const count=state.writes.length;
  await assert.rejects(state.host.reply(threadId,'Intrusion'),/not available/);
  await assert.rejects(state.host.markRead(threadId),/not available/); assert.equal(state.writes.length,count);
  state.login('owner'); await state.host.reply(threadId,'Reply'); await state.host.markRead(threadId);
  assert.equal(state.records.get('hostMessageThreads/'+threadId).lastSenderUid,'owner');
});
test('host request aborts before writing if identity changes while looking up the event',async()=>{
  const state=setup(), original=state.sdk.getDocFromServer;
  state.sdk.getDocFromServer=async ref=>{ const value=await original(ref); if(ref.path==='events/first')state.login('owner'); return value; };
  await assert.rejects(state.host.send('first','Question'),/account changed/); assert.equal(state.writes.length,0);
});

test('inbox subscriptions keep the latest 200 messages chronological and clear on account change',async()=>{
  const state=setup(), {threadId}=await state.host.send('first','Initial message');
  const path='hostMessageThreads/'+threadId+'/messages/';
  for(const key of state.records.keys()) if(key.startsWith(path)) state.records.delete(key);
  for(let i=0;i<205;i++) state.records.set(path+i,{text:'Message '+i,senderUid:'viewer',createdAt:new Date(2026,0,1,0,i)});
  let rows=[];
  const stop=state.host.watchMessages(threadId,value=>{rows=value;},error=>assert.fail(error));
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(rows.length,200); assert.equal(rows[0].text,'Message 5'); assert.equal(rows.at(-1).text,'Message 204');
  state.login('admin'); state.emit(); await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(rows,[]); stop(); assert.equal(state.listeners.size,0);
});
test('series editor updates future shared details only, merges legacy IDs and protects authority and dates',async()=>{
  const state=setup(); state.login('owner');
  const selection=await state.editor.prepare(future);
  assert.deepEqual(selection.__futureIds,['first','legacy']);
  const count=await state.editor.save(selection,{notes:'Updated',createdByUserId:'viewer',status:'archived',eventDate:'2100-01-01',seriesId:'injected',isLive:true});
  assert.equal(count,2);
  for(const id of ['first','legacy']) {
    const event=state.records.get('events/'+id);
    assert.equal(event.notes,'Updated'); assert.equal(event.eventDate,future.eventDate);
    assert.equal(event.createdByUserId,'owner'); assert.equal(event.status,'active'); assert.equal(event.isLive,undefined);
  }
  assert.equal(state.records.get('events/past').notes,'Original');
  assert.equal(state.records.get('events/live').notes,'Original');
});
test('series editing refuses stale changes, added occurrences and account switches before committing',async()=>{
  for(const mode of ['changed','added','identity']) {
    const state=setup(); state.login('owner'); state.records.get('events/first').updatedAt='unchanged-legacy-timestamp';
    const selection=await state.editor.prepare(future);
    if(mode==='changed')state.records.get('events/first').notes='Another editor';
    if(mode==='added')state.records.set('events/added',future);
    if(mode==='identity')state.login('admin');
    await assert.rejects(state.editor.save(selection,{notes:'Attempt'}),/changed/); assert.equal(state.writes.length,0);
  }
});
test('series editing rechecks live state and account eligibility inside its transaction',async()=>{
  for(const mode of ['live','inactive']) {
    const state=setup(); state.login('owner'); const selection=await state.editor.prepare(future);
    const original=state.sdk.runTransaction;
    state.sdk.runTransaction=async(...args)=>{
      if(mode==='live')state.records.get('events/first').isLive=true;
      else state.records.get('users/owner').isActive=false;
      return original(...args);
    };
    await assert.rejects(state.editor.save(selection,{notes:'Attempt'})); assert.equal(state.writes.length,0);
  }
});
test('mixed-city, unauthorized and read-only series access fails',async()=>{
  const state=setup(); await assert.rejects(state.editor.prepare(future),/cannot edit/);
  state.login('admin'); state.records.get('events/legacy').metroArea='melbourne';
  await assert.rejects(state.editor.prepare(future),/cannot edit/);
  const readonly=setup({readOnly:true}); readonly.login('owner');
  await assert.rejects(readonly.editor.prepare(future),/read-only/);
});

const recurrence = {calendarType:'gregorian',frequency:'week',repeatEvery:1,endMode:'count',occurrenceCount:2};
const schedule = () => ({recurrence,occurrences:generateGregorianOccurrences({...recurrence,startDate:'2099-11-01'})});
test('rescheduling preserves event IDs, ownership, total/index history and all past/live occurrences',async()=>{
  const state=setup(); state.login('owner');
  Object.assign(state.records.get('events/first'),{recurrenceIndex:4,recurrenceTotal:5,seriesStartDate:'2099-09-01'});
  Object.assign(state.records.get('events/legacy'),{recurrenceIndex:5,recurrenceTotal:5,seriesStartDate:'2099-09-01'});
  const selection=await state.editor.prepare(future), plan=schedule();
  await state.editor.save(selection,{notes:'Rescheduled',createdByUserId:'intruder'},plan);
  for(const [index,id] of ['first','legacy'].entries()) {
    const event=state.records.get('events/'+id);
    assert.equal(event.eventDate,plan.occurrences[index].eventDate);
    assert.equal(event.createdByUserId,'owner'); assert.equal(event.recurrenceIndex,index+4);
    assert.equal(event.recurrenceTotal,5); assert.equal(event.seriesStartDate,'2099-09-01');
    assert.equal(event.seriesEndDate,'2099-11-08'); assert.equal(event.recurrenceRuleSnapshot.frequency,'week');
  }
  assert.equal(state.records.get('events/past').eventDate,'2000-01-01');
  assert.equal(state.records.get('events/live').eventDate,future.eventDate);
  assert.equal([...state.records.keys()].filter(key=>key.startsWith('events/')).length,4);
});

test('invalid, duplicate, reordered, past, count-changing and stale schedules cannot partially save',async()=>{
  for(const mode of ['invalid','duplicate','order','past','count','stale','rule']) {
    const state=setup(); state.login('owner'); const selection=await state.editor.prepare(future), plan=schedule();
    if(mode==='invalid')plan.occurrences[0].eventDate='2099-02-31';
    if(mode==='duplicate')plan.occurrences[1].eventDate=plan.occurrences[0].eventDate;
    if(mode==='order')plan.occurrences.reverse();
    if(mode==='past')plan.occurrences[0].eventDate='2000-01-01';
    if(mode==='count')plan.occurrences.pop();
    if(mode==='stale')state.records.get('events/legacy').notes='Changed by native';
    if(mode==='rule')plan.recurrence={...recurrence,repeatEvery:0};
    await assert.rejects(state.editor.save(selection,{notes:'Attempt'},plan)); assert.equal(state.writes.length,0);
  }
});

test('calendar generation rejects invalid Gregorian dates and retains native Hijri occurrence fields',async()=>{
  assert.throws(()=>generateGregorianOccurrences({...recurrence,startDate:'2099-02-31'}),/first event date/);
  const state=setup(); state.login('owner'); const selection=await state.editor.prepare(future);
  const rule={...recurrence,calendarType:'hijri',frequency:'month'};
  const occurrences=generateHijriOccurrences({...rule,startHijri:{day:5,month:9,year:1523}});
  await state.editor.save(selection,{notes:'Hijri series'},{recurrence:rule,occurrences});
  const event=state.records.get('events/first');
  assert.equal(event.enteredAsHijri,true); assert.equal(event.hijriDay,5); assert.equal(event.hijriMonth,9);
  assert.equal(event.eventDate,occurrences[0].eventDate);
});

test('prayer preparation receives each rescheduled date before transactional updates',async()=>{
  const state=setup(); state.login('owner'); const seen=[];
  const editor=createEventSeriesEditor({db:{},sdk:state.sdk,currentUser:()=>({uid:'owner'}),canEdit:()=>true,
    prepareFields:(updates,previous)=>{seen.push(previous.eventDate);return {...updates,startTime:previous.eventDate.endsWith('01')?'17:01':'17:08'};}});
  const selection=await editor.prepare(future);
  await editor.save(selection,{timeMode:'prayer'},schedule());
  assert.deepEqual(seen,['2099-11-01','2099-11-08']);
  assert.equal(state.records.get('events/first').startTime,'17:01'); assert.equal(state.records.get('events/legacy').startTime,'17:08');
});
