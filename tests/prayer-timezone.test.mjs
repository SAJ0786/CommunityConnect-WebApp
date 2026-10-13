import test from 'node:test';
import assert from 'node:assert/strict';
import {timeZoneOffsetHours,calculatePrayerTimes} from '../src/services/prayerTimeService.js';
test('prayer timezone calculations follow Australian DST and half-hour offsets',()=>{
  for(const [zone,winter,summer] of [
    ['Australia/Sydney',10,11],['Australia/Melbourne',10,11],['Australia/Adelaide',9.5,10.5],
    ['Australia/Brisbane',10,10],['Australia/Perth',8,8],['Australia/Darwin',9.5,9.5],
  ]) {
    assert.equal(timeZoneOffsetHours('2026-07-01',zone),winter);
    assert.equal(timeZoneOffsetHours('2026-12-01',zone),summer);
  }
  assert.equal(timeZoneOffsetHours('2026-10-03','Australia/Sydney'),10);
  assert.equal(timeZoneOffsetHours('2026-10-04','Australia/Sydney'),11);
  const address={fullAddress:'Synthetic Sydney location',latitude:-33.86,longitude:151.2,state:'NSW'};
  const before=calculatePrayerTimes('2026-10-03',address), after=calculatePrayerTimes('2026-10-04',address);
  const minutes=value=>Number(value.split(':')[0])*60+Number(value.split(':')[1]);
  assert.ok(minutes(after.zohrain)-minutes(before.zohrain)>=58);
  assert.ok(minutes(after.zohrain)-minutes(before.zohrain)<=62);
});
test('invalid dates, zones and unsupported timezone formatting fail without a guessed prayer time',()=>{
  assert.equal(timeZoneOffsetHours('2026-02-31','Australia/Sydney'),null);
  assert.equal(timeZoneOffsetHours('2026-10-12','invalid/zone'),null);
  const original=Intl.DateTimeFormat;
  try {
    Intl.DateTimeFormat=function(){throw new RangeError('Unsupported formatter');};
    assert.equal(calculatePrayerTimes('2026-10-12',{fullAddress:'Synthetic Adelaide location',latitude:-34.9,longitude:138.6,state:'SA'}),null);
  } finally { Intl.DateTimeFormat=original; }
});
