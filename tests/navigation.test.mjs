import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { navigationTabs, accountItems, eventExploreItems, eventsSidebarItems, userInitials } from '../src/utils/navigation.mjs';

test('Events and Businesses expose the native five-tab order with a working guest Menu', () => {
  assert.deepEqual(navigationTabs().map(item => item.label), ['Home','My Events','Add Event','Favourites','Menu']);
  assert.deepEqual(navigationTabs(true).map(item => item.label), ['Home','Promotions','Add Business','My Business','Menu']);
  for (const directory of [false, true]) {
    const tabs = navigationTabs(directory);
    assert.equal(tabs.filter(item => item.primary).length, 1);
    assert.equal(tabs[2].member, true);
    assert.equal(Boolean(tabs[4].member), false);
  }
});
test('Guests cannot gain account or admin shortcuts from a stale profile role', () => {
  assert.ok(eventsSidebarItems({guest:true,role:'superAdmin'}).every(item => !item.member && !['admin','bulkshare','notifications','host-inbox'].includes(item.key)));
  for (const directory of [false,true]) {
    assert.deepEqual(accountItems({ directory, guest:true, role:'superAdmin' }).map(item => item.key), ['help','share-app']);
  }
});
test('Menus route to the correct module inbox and limit administration to admin roles', () => {
  for (const role of [undefined,'user','admin','superAdmin']) {
    for (const directory of [false,true]) {
      const keys = accountItems({ role, directory }).map(item => item.key);
      const admin = ['admin','superAdmin'].includes(role);
      assert.equal(keys.includes('admin'), admin);
      assert.equal(keys.includes('bulkshare'), admin && !directory);
      assert.equal(keys.includes('inbox'), directory);
      assert.equal(keys.includes('host-inbox'), !directory);
      assert.equal(keys.includes('saved'), directory);
      const sidebar = eventsSidebarItems({guest:false,role}).map(item => item.key);
      assert.equal(sidebar.includes('admin'),admin);
      assert.equal(sidebar.includes('bulkshare'),admin);
      assert.equal(new Set(sidebar).size,sidebar.length);
    }
  }
});
test('Events navigation retains member tabs and discovery tools when bottom navigation is hidden', () => {
  const keys = new Set(eventExploreItems.map(item => item.key));
  for (const item of navigationTabs().filter(item => item.key !== 'menu')) assert.ok(keys.has(item.key));
  for (const key of ['search','calendar','hijri-calendar','streams','install']) assert.ok(keys.has(key));
  assert.ok(eventExploreItems.filter(item => !item.member).every(item => !['my','add','favourites'].includes(item.key)));
});
test('Menu initials handle blank names and guests without exposing contact information', () => {
  assert.equal(userInitials({ fullName:'  Example   Member  ' }), 'EM');
  assert.equal(userInitials({ fullName:'   ' }), 'U');
  assert.equal(userInitials({ fullName:'Private Member' }, null, true), 'G');
});
test('Host message notifications retain the conversation when opening Host Inbox', () => {
  const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const inbox = fs.readFileSync(new URL('../src/pages/HostInbox.jsx', import.meta.url), 'utf8');
  const notifications = fs.readFileSync(new URL('../src/services/notificationService.js', import.meta.url), 'utf8');
  assert.match(app, /setHostInboxThreadId\(row\.threadId\)/);
  assert.match(app, /initialThreadId=\{hostInboxThreadId\}/);
  assert.match(inbox, /setSelected\(initialThreadId\)/);
  assert.match(notifications, /thread:\s*payload\.data\.threadId/);
});
