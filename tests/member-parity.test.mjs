import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as web from '../src/utils/memberProfile.mjs';
const nativeSource = fs.readFileSync('../sdk51-package-backup/src/utils/memberProfile.js', 'utf8');
const native = await import(`data:text/javascript;base64,${Buffer.from(nativeSource).toString('base64')}`);
const member = { uid: 'test-member', phoneNumber: '+61400000000' };
const complete = { fullName: 'Test Member', email: 'test@example.com', defaultCity: 'sydney' };

test('web/native profile gates agree for guests, refresh, incomplete and inactive accounts', () => {
  const cases = [
    [null, null, false, 'guest'], [{ isAnonymous: true }, null, false, 'guest'],
    [member, complete, true, 'loading'], [member, null, false, 'retry'],
    [member, {...complete, defaultCity:''}, false, 'choose-city'], [member, {...complete, defaultCity:undefined}, false, 'choose-city'],
    [member, {}, false, 'complete-profile'], [member, { fullName: 'Test Member' }, false, 'complete-profile'],
    [member, { ...complete, email: 'invalid' }, false, 'complete-profile'],
    [member, { ...complete, isActive: false }, false, 'blocked'],
    ...['banned', 'archived', 'deleted'].map(accountStatus => [member, { ...complete, accountStatus }, false, 'blocked']),
    [{ ...member, phoneNumber: null }, complete, false, 'verify-phone'], [member, complete, false, 'ready'],
  ];
  for (const [user, profile, loading, expected] of cases) {
    assert.equal(web.memberEntryState(user, profile, loading), expected);
    assert.equal(native.memberEntryState(user, profile, loading), expected);
  }
});

test('join date parsing and newest-first order match both native dashboards', () => {
  const rows = [
    { id: 'unknown' }, { id: 'old', createdAt: { seconds: 1000 } },
    { id: 'a', registeredAt: { toMillis: () => 5000000 }, createdAt: '2030-01-01' },
    { id: 'b', registeredAt: { _seconds: 5000 } },
    { id: 'legacy', joinedAt: new Date(3000000) },
    { id: 'iso', createdOn: '1970-01-01T00:33:20.000Z' },
    { id: 'invalid', registeredAt: 'invalid', createdAt: { toDate: () => new Date(4000000) } },
  ];
  assert.deepEqual([...rows].sort(web.newestMembersFirst).map(row => row.id), ['a', 'b', 'invalid', 'legacy', 'iso', 'old', 'unknown']);
  assert.deepEqual([...rows].sort(web.newestMembersFirst), [...rows].sort(native.newestMembersFirst));
  for (const row of rows) {
    assert.equal(web.memberJoinedMillis(row), native.memberJoinedMillis(row));
    assert.equal(web.memberJoinedLabel(row), native.memberJoinedLabel(row));
  }
  assert.equal(web.memberJoinedLabel({}), 'Date unavailable');
  const dashboard = fs.readFileSync('src/pages/AdminDashboard.jsx', 'utf8');
  assert.equal((dashboard.match(/\.sort\(newestMembersFirst\)/g) || []).length, 2, 'UI and CSV use shared sorting');
});
