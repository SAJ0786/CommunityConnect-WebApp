import test from 'node:test';
import assert from 'node:assert/strict';
import { readNotificationPreferences, notificationPreferencePayload } from '../src/utils/profilePreferences.mjs';
import { filterHijriObservances } from '../src/utils/hijriCalendar.mjs';
import { upcomingEventsCsv } from '../src/utils/adminEventExport.mjs';
import { getPrayerLocation } from '../src/utils/prayerLocations.js';
import { calculatePrayerTimes } from '../src/services/prayerTimeService.js';

test('notification payload keeps opt-outs, uses native fields and excludes privilege fields', () => {
  const values = readNotificationPreferences({ emailNotificationsEnabled:false, businessNotificationsEnabled:false });
  const payload = notificationPreferencePayload({...values,role:'superAdmin'}, 'directory');
  assert.equal(payload.emailNotificationsEnabled,false);
  assert.equal(payload.reminderEmailEnabled,false);
  assert.equal(payload.businessNotificationsEnabled,false);
  assert.equal(payload.pushNotificationsEnabled,true);
  assert.equal(payload.defaultModule,'directory');
  assert.equal('role' in payload,false);
  assert.throws(() => notificationPreferencePayload({...values,pushNotificationsEnabled:'false'},'events'));
  assert.throws(() => notificationPreferencePayload(values,'invalid'));
});

test('Hijri defaults to this month; search and multiple types explore the year without exposing disabled observances', () => {
  const rows = [{id:1,month:4,name:'Birth',category:'Wiladat'}, {id:2,month:9,name:'Night',category:'Amaal'}, {id:3,month:10,name:'Eid',category:'Eid'}, {id:4,month:4,name:'Hidden',category:'Wiladat',enabled:false}];
  const ids = opts => filterHijriObservances(rows,{currentMonth:4,...opts}).map(row=>row.id);
  assert.deepEqual(ids({}),[1]);
  assert.deepEqual(ids({search:' night '}),[2]);
  assert.deepEqual(ids({categories:['Amaal','Eid']}),[2,3]);
  assert.deepEqual(ids({search:'Birth',categories:['Eid']}),[]);
  assert.deepEqual(ids({search:'Hidden'}),[]);
});

test('event export excludes past, hidden and inactive events and neutralizes spreadsheet formulas', () => {
  const base = {eventDate:'2026-10-15',startTime:'12:00',eventType:'Test',hostName:'=IMPORTXML("url")'};
  const csv = upcomingEventsCsv([base,{...base,eventDate:'2026-01-01'},{...base,hidden:true},{...base,isActive:false}], '2026-10-13');
  assert.equal(csv.split('\r\n').length,2);
  assert.ok(csv.includes("'="));
  assert.ok(csv.includes('""url""'));
});

test('calendar city prayer times include sunrise and sunset in chronological order', () => {
  for (const city of ['sydney','melbourne','canberra','brisbane','adelaide','hobart','perth']) {
    const result = calculatePrayerTimes('2026-10-13',getPrayerLocation(city));
    assert.ok(result.fajr < result.sunrise);
    assert.ok(result.sunrise < result.zohrain);
    assert.ok(result.zohrain < result.sunset);
    assert.ok(result.sunset < result.maghreb);
  }
  assert.equal(getPrayerLocation('rest-of-australia').suburb,'Sydney');
});
