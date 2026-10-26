import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {createCalendarHandlers}=require('../functions/calendar-subscriptions.cjs');
const when=new Date('2026-10-26T01:00:00Z');
const request={auth:{uid:'member',token:{firebase:{sign_in_provider:'phone'}}},data:{}};
function harness(extra={}) {
 const data=new Map(Object.entries({
  'users/member':{fullName:'Test Member',email:'test@example.test',defaultCity:'sydney',isActive:true},
  'calendarSubscriptions/member':{lastPolled:'2026-10-20',active:true},
  'events/sydney':{status:'active',metroArea:'sydney',eventDate:'2026-11-01',startTime:'17:35',eventType:'Majlis',hostName:'Test Host',address:{suburb:'Parramatta',fullAddress:'SECRET STREET'},notes:'SECRET NOTES',hostPhone:'SECRET PHONE'},
  'events/melbourne':{status:'active',metroArea:'melbourne',eventDate:'2026-11-01',startTime:'18:00',title:'Melbourne event'},
  'events/hidden':{status:'active',metroArea:'sydney',hidden:true,eventDate:'2026-11-01',title:'HIDDEN'},
  'events/inactive':{status:'inactive',metroArea:'sydney',eventDate:'2026-11-01',title:'INACTIVE'},
  'registrationEvents/reg':{status:'approved',city:'sydney',date:'2026-11-02',title:'Public registration',suburb:'Parramatta',answers:'SECRET ANSWERS',privateDetails:{address:'SECRET VENUE'}},
  'registrationEvents/hidden':{status:'approved',city:'sydney',hidden:true,date:'2026-11-02',title:'HIDDEN REG'},
  ...extra,
 }));
 const snap=path=>({exists:data.has(path),data:()=>data.get(path)});
 const ref=path=>({path,get:async()=>snap(path),set:async(value,{merge}={})=>data.set(path,merge?{...data.get(path),...value}:value)});
 const db={
  collection:name=>({
   doc:id=>ref(name+'/'+id),
   where:(key,op,value)=>({get:async()=>({docs:[...data.entries()].filter(([p,v])=>p.startsWith(name+'/')&&p.split('/').length===2&&v[key]===value).map(([p,v])=>({id:p.split('/')[1],data:()=>v}))})}),
  }),
  runTransaction:async fn=>fn({get:r=>r.get(),set:(r,v,o)=>r.set(v,o)}),
 };
 const auth={getUser:async uid=>{if(uid!=='member')throw Object.assign(new Error(),{code:'auth/user-not-found'});return{phoneNumber:'+61400000000',disabled:false};}};
 const api=createCalendarHandlers({db,auth,HttpsError:class extends Error{constructor(code,message){super(message);this.code=code;}},serverTimestamp:()=>when.toISOString(),now:()=>when});
 async function feed(query={t:'member'}) {const response={statusCode:200,headers:{},set(k,v){this.headers[k]=v;return this;},status(s){this.statusCode=s;return this;},send(body){this.body=body;return this;}};await api.feed({query},response);return response;}
 return{...api,feed,data,auth,db};
}
test('legacy subscription is preserved, city-scoped, excludes hidden data and uses public projections',async()=>{
 const h=harness(),r=await h.feed();assert.equal(r.statusCode,200);assert.match(r.body,/Majlis - Test Host/);assert.match(r.body,/Public registration/);assert.match(r.body,/DTSTART:20261101T063500Z/);
 for(const forbidden of ['Melbourne event','HIDDEN','INACTIVE','SECRET','DTEND:20261101T063500Z'])assert.ok(!r.body.includes(forbidden),forbidden);
 assert.match(r.headers['Cache-Control'],/no-store/);assert.equal(h.data.get('calendarSubscriptions/member').active,true);
});
test('same subscription follows changed default city and ignores client city overrides',async()=>{
 const h=harness();h.data.get('users/member').defaultCity='melbourne';const r=await h.feed({t:'member',city:'sydney'});assert.match(r.body,/Melbourne event/);assert.doesNotMatch(r.body,/Test Host|Public registration/);
});
for(const [label,changes] of [['missing city',{defaultCity:undefined}],['invalid city',{defaultCity:'not-a-city'}],['disabled profile',{isActive:false}],['legacy inactive',{active:false}],['deleted',{accountStatus:'deleted'}]])test(label+' gets an empty calendar without leaking or reactivating',async()=>{
 const h=harness();Object.assign(h.data.get('users/member'),changes);const r=await h.feed();assert.equal(r.statusCode,200);assert.match(r.body,/BEGIN:VCALENDAR/);assert.doesNotMatch(r.body,/BEGIN:VEVENT/);
});
test('revoked subscription stays revoked; polling does not create new legacy subscriptions',async()=>{
 const h=harness();h.data.set('calendarSubscriptions/member',{active:false,lastPolled:'old'});assert.doesNotMatch((await h.feed()).body,/BEGIN:VEVENT/);assert.equal(h.data.get('calendarSubscriptions/member').active,false);
 h.data.delete('calendarSubscriptions/member');assert.doesNotMatch((await h.feed()).body,/BEGIN:VEVENT/);assert.equal(h.data.has('calendarSubscriptions/member'),false);
});
test('new links are random hashed secrets, account-bound and cannot opt into legacy UID access',async()=>{
 const h=harness();h.data.delete('calendarSubscriptions/member');const first=await h.create({...request,data:{uid:'other',city:'melbourne'}});const secret=new URL(first.url).searchParams.get('s');assert.equal(secret.length,43);assert.ok(!first.url.includes('member'));
 assert.equal(h.data.get('calendarSubscriptions/member').legacyEnabled,false);assert.doesNotMatch((await h.feed()).body,/BEGIN:VEVENT/);
 const records=[...h.data].filter(([p])=>p.startsWith('calendarFeedTokens/'));assert.equal(records.length,1);assert.ok(!JSON.stringify(records).includes(secret));assert.equal(records[0][1].uid,'member');
 assert.match((await h.feed({s:secret})).body,/Test Host/);records[0][1].active=false;assert.doesNotMatch((await h.feed({s:secret})).body,/BEGIN:VEVENT/);
});
test('existing legacy subscribers retain their old link after creating a new secure one',async()=>{
 const h=harness();await h.create(request);assert.equal(h.data.get('calendarSubscriptions/member').legacyEnabled,true);assert.match((await h.feed()).body,/Test Host/);
});
test('creation requires an authenticated active member and explicit valid city',async()=>{
 const h=harness();await assert.rejects(h.create({}),{code:'unauthenticated'});await assert.rejects(h.create({...request,auth:{...request.auth,token:{firebase:{sign_in_provider:'anonymous'}}}}),{code:'unauthenticated'});
 h.data.get('users/member').defaultCity=undefined;await assert.rejects(h.create(request),{code:'failed-precondition'});assert.equal([...h.data.keys()].filter(p=>p.startsWith('calendarFeedTokens/')).length,0);
});
test('new-link issuance is bounded, failures do not expose a new secret',async()=>{
 const h=harness();for(let i=0;i<10;i++)await h.create(request);await assert.rejects(h.create(request),{code:'resource-exhausted'});assert.equal([...h.data.keys()].filter(p=>p.startsWith('calendarFeedTokens/')).length,10);
});
test('disabled Auth users get no feed and transient provider failures are retryable',async()=>{
 const h=harness();h.auth.getUser=async()=>({disabled:true});assert.doesNotMatch((await h.feed()).body,/BEGIN:VEVENT/);
 h.auth.getUser=async()=>{throw Error('temporary Auth outage');};assert.equal((await h.feed()).statusCode,503);
});
