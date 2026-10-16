import test from 'node:test';
import assert from 'node:assert/strict';
import { registrationCalendarLines } from '../functions/registration-calendar.cjs';
const options = { escape:value => String(value).replace(/\n/g, '\\n'), stamp:'20261016T000000Z' };
const base = { status:'approved', date:'2026-12-01', title:'Workshop', suburb:'Parramatta',
  address:'PRIVATE STREET', venue:{ fullAddress:'PRIVATE STREET' }, poster:'PRIVATE IMAGE', answers:'PRIVATE ANSWERS' };
test('registration subscriptions export all-day public metadata without private venue or answers', () => {
  const lines = registrationCalendarLines('event', base, options);
  assert.ok(lines.includes('DTSTART;VALUE=DATE:20261201'));
  assert.ok(lines.includes('DTEND;VALUE=DATE:20261202'));
  assert.ok(lines.includes('LOCATION:Parramatta'));
  assert.doesNotMatch(lines.join('\n'), /PRIVATE|TZID|T09/);
});
test('timed registration subscriptions use exact UTC instants including overnight and no invented end', () => {
  const timed = { ...base, startTime:'23:00', endTime:'01:00', startAt:'2026-12-01T12:00:00Z', endAt:'2026-12-01T14:00:00Z' };
  const lines = registrationCalendarLines('event', timed, options);
  assert.ok(lines.includes('DTSTART:20261201T120000Z'));
  assert.ok(lines.includes('DTEND:20261201T140000Z'));
  assert.equal(registrationCalendarLines('event', { ...timed, endTime:'', endAt:null }, options).some(line => line.startsWith('DTEND')), false);
  assert.throws(() => registrationCalendarLines('event', { ...timed, startAt:null }, options), /UTC instant/);
});
test('unapproved, hidden and deleted registration events never enter calendar feed', () => {
  for (const changes of [{ status:'pending' }, { status:'cancelled' }, { deletedAt:'now' }, { hidden:true }]) {
    assert.deepEqual(registrationCalendarLines('event', { ...base, ...changes }, options), []);
  }
  assert.throws(() => registrationCalendarLines('event', { ...base, date:'2026-02-30' }, options), /calendar date/);
});
