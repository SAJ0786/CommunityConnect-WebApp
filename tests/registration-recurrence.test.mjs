import test from 'node:test';
import assert from 'node:assert/strict';
import { registrationSeriesPlan } from '../src/registration/registrationRecurrence.mjs';
import { createRegistrationClient } from '../src/registration/registrationClient.mjs';
import { calculatePrayerTimes, applyPrayerOffset } from '../src/services/prayerTimeService.js';
import { hijriToGregorian } from '../src/services/hijriService.js';

const base = {
  frequency:'recurring', repeatFrequency:'fortnight', occurrenceCount:3,
  date:'2027-03-28', closes:'2027-03-26T18:30', capacity:30,
  startTime:'18:00', endTime:'20:00', timeMode:'manual',
  venue:{ latitude:-33.8, longitude:151, suburb:'Parramatta', state:'NSW', postcode:'2150' },
};
test('one-time events have no series request; fortnightly dates keep local closing offsets across DST', () => {
  assert.equal(registrationSeriesPlan({...base,frequency:'single'}),null);
  const plan=registrationSeriesPlan(base);
  assert.equal(plan.recurrence.frequency,'week');
  assert.equal(plan.recurrence.repeatEvery,2);
  assert.deepEqual(plan.occurrences.map(row=>row.date),['2027-03-28','2027-04-11','2027-04-25']);
  assert.deepEqual(plan.occurrences.map(row=>row.closes),['2027-03-26T18:30','2027-04-09T18:30','2027-04-23T18:30']);
  assert.ok(plan.occurrences.every(row=>row.startTime==='18:00'&&row.capacity===30));
});
test('occurrences allow independent closing and capacity; invalid overrides cannot be saved', () => {
  const plan=registrationSeriesPlan({...base,occurrenceSettings:{'2027-04-11':{capacity:'12',closes:'2027-04-08T09:00'}}});
  assert.equal(plan.occurrences[1].capacity,12);
  assert.equal(plan.occurrences[1].closes,'2027-04-08T09:00');
  assert.equal(plan.occurrences[2].capacity,30);
  assert.throws(()=>registrationSeriesPlan({...base,occurrenceSettings:{'2027-04-11':{closes:'2027-04-11T09:00'}}}),/before the event date/);
  assert.throws(()=>registrationSeriesPlan({...base,occurrenceSettings:{'2027-04-11':{capacity:0}}}),/capacity/);
});
test('true Hijri monthly cadence retains lunar dates instead of using Gregorian spacing', () => {
  const date=hijriToGregorian(10,4,1448,[]);
  const plan=registrationSeriesPlan({...base,date,closes:'',enteredAsHijri:true,hijriDay:10,hijriMonth:4,hijriYear:1448,repeatFrequency:'month'});
  assert.equal(plan.recurrence.calendarType,'hijri');
  assert.deepEqual(plan.recurrence.startHijri,{day:10,month:4,year:1448});
  assert.deepEqual(plan.occurrences.map(row=>row.hijriMonth),[4,5,6]);
  assert.equal(plan.occurrences[1].date,hijriToGregorian(10,5,1448,[]));
  assert.ok(plan.occurrences.every(row=>row.enteredAsHijri&&row.hijriDay===10&&row.closes===''));
});
test('each prayer occurrence gets its own calculated city-local clock and no inferred duration', () => {
  const plan=registrationSeriesPlan({...base,repeatFrequency:'month',timeMode:'prayer',prayerName:'maghreb',prayerOffsetMinutes:30,endTime:''});
  for(const row of plan.occurrences){
    const prayer=calculatePrayerTimes(row.date,base.venue);
    assert.equal(row.startTime,applyPrayerOffset(prayer.maghreb,30));
    assert.equal(row.endTime,'');
  }
  assert.notEqual(plan.occurrences[0].startTime,plan.occurrences[2].startTime);
});
test('series generation enforces bounded counts, supported cadence and matching first date', () => {
  assert.equal(registrationSeriesPlan({...base,repeatFrequency:'day',occurrenceCount:100}).occurrences.length,100);
  assert.equal(registrationSeriesPlan({...base,repeatFrequency:'year',occurrenceCount:5}).occurrences.length,5);
  for(const occurrenceCount of [1,101,2.5]) assert.throws(()=>registrationSeriesPlan({...base,occurrenceCount}),/between 2 and 100/);
  assert.throws(()=>registrationSeriesPlan({...base,repeatFrequency:'year',occurrenceCount:6}),/between 2 and 5/);
  assert.throws(()=>registrationSeriesPlan({...base,repeatFrequency:'unexpected'}),/frequency/);
  assert.throws(()=>registrationSeriesPlan({...base,repeatFrequency:'month',occurrenceCount:20}),/beyond one year/);
  assert.throws(()=>registrationSeriesPlan({...base,timeMode:'prayer',prayerName:'missing'}),/Prayer time could not/);
});
test('series transport is explicit and strips editor-only data, private poster bytes and immutable provenance', async () => {
  const calls=[],api=createRegistrationClient(async(name,data)=>{calls.push({name,data});return {data:{seriesId:'created',events:[]}};},{enabled:true});
  const plan=registrationSeriesPlan(base);
  const draft={...base,title:'Workshop',poster:{base64:'private'},seriesId:'forged',occurrenceIndex:0,recurrenceRule:{forged:true},occurrenceSettings:{private:'ui'}};
  await api.createSeries({city:'sydney',createKey:'stable',draft,...plan});
  assert.equal(calls[0].name,'createRegistrationSeries');
  assert.deepEqual(calls[0].data.recurrence,plan.recurrence);
  for(const key of ['poster','frequency','repeatFrequency','occurrenceCount','occurrenceSettings','seriesId','occurrenceIndex','recurrenceRule']) assert.equal(key in calls[0].data.draft,false,key);
  await api.save({eventId:'occurrence',expectedRevision:3,draft,city:'sydney'});
  assert.equal(calls[1].name,'saveRegistrationEvent');
  assert.equal('recurrence' in calls[1].data,false);
});
