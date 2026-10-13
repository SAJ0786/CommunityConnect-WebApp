import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'esbuild';
import { businessOpenNow, coordinates, distanceKm, matchesEventPeriod } from '../src/utils/browseFilters.mjs';
import { phoneAuthAddressError } from '../src/utils/phoneAuthMessages.mjs';
import { eventActions } from '../src/utils/eventActions.mjs';
import { availableEventTypes, eventBrowseType, eventTypeIcon } from '../src/utils/eventBrowseTypes.mjs';
import { directoryQuery } from '../src/utils/businessRoutes.mjs';

test('native event periods use calendar boundaries, including Sunday and month rollover', () => {
  const now = new Date(2026, 9, 10, 12);
  const match = (date, period, clock = now) => matchesEventPeriod({ eventDate: date, isLive: true }, period, clock);
  assert.equal(match('2026-10-10', 'today'), true);
  assert.equal(match('2026-10-09', 'today'), false);
  assert.equal(match('2026-10-11', 'tomorrow'), true);
  assert.equal(match('2026-10-11', 'week'), true);
  assert.equal(match('2026-10-12', 'week'), false);
  assert.equal(match('2026-10-12', 'week', new Date(2026, 9, 11, 12)), false);
  assert.equal(match('2026-10-31', 'month'), true);
  assert.equal(match('2026-11-01', 'month'), false);
  assert.equal(match('2027-01-01', 'tomorrow', new Date(2026, 11, 31, 12)), true);
});
test('open now uses business city time, split shifts, overnight hours and unknown states', () => {
  const business = { city: 'sydney', hours: ['Closed', 'Closed', 'Closed', 'Closed', '22:00–02:00 (next day)', 'Closed', 'Closed'] };
  assert.equal(businessOpenNow(business, new Date('2026-10-09T14:00:00Z')), true); // Saturday 1am AEDT
  assert.equal(businessOpenNow(business, new Date('2026-10-09T15:00:00Z')), false);
  business.hours[5] = '09:00–12:00, 14:00–18:00';
  assert.equal(businessOpenNow(business, new Date('2026-10-10T02:00:00Z')), false); // 1pm AEDT
  assert.equal(businessOpenNow({ ...business, city: 'perth' }, new Date('2026-10-10T02:00:00Z')), true); // 10am AWST
  business.hours[5] = 'Open 24 hours';
  assert.equal(businessOpenNow(business, new Date('2026-10-10T02:00:00Z')), true);
  assert.equal(businessOpenNow({ city: 'sydney', hours: [] }), null);
  assert.equal(businessOpenNow({ ...business, city: 'rest-of-australia' }), null);
});
test('distance sort rejects missing or malformed coordinates, including null masquerading as zero', () => {
  for (const value of [undefined, {}, { latitude: null, longitude: null }, { latitude: '', longitude: '' }, { latitude: 91, longitude: 0 }]) {
    assert.equal(coordinates(value), null);
    assert.equal(distanceKm({ latitude: 0, longitude: 0 }, value), Infinity);
  }
  assert.equal(distanceKm({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 0 }), 0);
  assert.ok(Math.abs(distanceKm({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 }) - 111.195) < .01);
});
test('phone address failure explains localhost and never redirects people to the old domain', () => {
  assert.match(phoneAuthAddressError('localhost'), /configured test number/);
  assert.match(phoneAuthAddressError('127.0.0.1'), /authorised hosted preview/);
  assert.doesNotMatch(phoneAuthAddressError('communityconnect.siza.info'), /localhost|communityevents.siza.info/);
});

async function component(file, name = 'default') {
  const result = await build({ entryPoints: [file], bundle: true, write: false, platform: 'node', format: 'cjs',
    external: ['react', 'react-dom', 'lucide-react'], loader: { '.css': 'empty' }, preserveSymlinks: true });
  const module = { exports: {} };
  vm.runInNewContext(result.outputFiles[0].text, { module, exports: module.exports, require: createRequire(import.meta.url) });
  return module.exports[name];
}
test('business summary contains a logo and minimal metadata; contacts stay inside a closed disclosure', async () => {
  const Card = await component('src/components/BusinessBrowseCard.jsx');
  const business = { id: 'sample', name: 'Example Catering', logoUrl: 'https://example.com/logo.png',
    categories: ['Food & Catering'], suburb: 'Auburn', services: ['Catering'], hours: [],
    description: 'Long description', phone: '+61400000000', address: 'Published address' };
  const html = renderToStaticMarkup(React.createElement(Card, { business, returnQuery: '?city=sydney', openNow: true }));
  assert.match(html, /<details>/);
  assert.doesNotMatch(html, /<details open/);
  const summary = html.match(/<summary[\s\S]*?<\/summary>/)[0];
  assert.match(summary, /logo.png/);
  assert.match(summary, /Example Catering/);
  assert.doesNotMatch(summary, /Long description|Published address|tel:/);
  assert.ok(html.indexOf('tel:') > html.indexOf('</summary>'));
  assert.match(html, /\/businesses\/view\/sample\?city=sydney/);
});
test('city picker and native strips expose labelled controls and selection state', async () => {
  const City = await component('src/components/CitySelector.jsx');
  const html = renderToStaticMarkup(React.createElement(City, { value: 'melbourne', onChange() {} }));
  assert.match(html, /role="combobox"/);
  assert.match(html, /aria-label="Events location"/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /Melbourne/);
  const Controls = await component('src/components/EventBrowseControls.jsx');
  const controls = renderToStaticMarkup(React.createElement(Controls, { events: [], period: 'today', category: 'Majlis', onPeriod() {}, onCategory() {} }));
  assert.match(controls, /aria-label="Event filters"/);
  assert.match(controls, /aria-label="Event types"/);
  assert.equal((controls.match(/aria-pressed="true"/g) || []).length, 2);
  for (const label of ['Upcoming', 'Near Me', 'Today', 'Tomorrow', 'This Week', 'This Month', 'Prayers', 'Majlis', 'Milad']) assert.ok(controls.includes(label));
});

test('event-type filters use stored types, omit test-only options and use relevant icons', () => {
  const events = [
    {eventType:'Majlis', eventTypeDisplay:'Test Event'},
    {eventType:'Custom', customEventType:'Test Event'},
    {eventType:' Test Event '}, {eventTypeDisplay:'test event'},
    {eventType:'Friday Prayers'}, {eventType:'Dua-e-Tawassul'},
  ];
  assert.deepEqual(availableEventTypes(events), ['Majlis','Custom','Friday Prayers','Dua-e-Tawassul']);
  assert.equal(eventBrowseType(events[0]), 'Majlis');
  assert.equal(eventTypeIcon('Dua-e-Tawassul'), '🤲');
  assert.equal(eventTypeIcon('Friday Prayers'), '🕌');
  assert.equal(eventTypeIcon('Birthday'), '🎂');
  assert.equal(eventTypeIcon('Marriage'), '💍');
  assert.equal(eventTypeIcon('Unlisted type'), '🏷️');
});

test('native event actions remain visible and enforce guest, member, owner and preview restrictions', () => {
  const handlers = Object.fromEntries(['share','directions','contact','live','reminder','calendar','niaz','edit','copy','delete','editSeries','deleteSeries'].map(id => [id, () => {}]));
  handlers.uid = 'viewer';
  const event = { createdByUserId:'owner', address:{suburb:'Auburn'}, seriesId:'series' };
  const enabled = args => eventActions({event, handlers, ...args}).filter(action => !action.disabled).map(action => action.id);
  assert.deepEqual(enabled({member:false, manage:false, admin:false}), ['share']);
  const member = enabled({member:true, manage:false, admin:false});
  assert.ok(member.includes('calendar') && !member.includes('edit') && !member.includes('copy'));
  const owner = enabled({member:true, manage:true, admin:false});
  assert.ok(owner.includes('edit') && owner.includes('delete') && owner.includes('editSeries') && !owner.includes('deleteSeries'));
  assert.deepEqual(enabled({member:true, manage:true, admin:true, readOnly:true}), ['share','directions','calendar','niaz']);
  assert.equal(eventActions({event,handlers:{share(){}},member:true,manage:true,admin:true}).find(a => a.id==='contact').reason, 'This workflow is not connected in the web preview yet.');
});
test('Niaz matches native ownership and city scope and preserves its service in directory links', async () => {
  const canArrange = await component('src/utils/permissions.js', 'canArrangeEventNiaz');
  const event = { id: 'example', createdByUserId: 'current-owner', ownerUid: 'previous-owner', metroArea: 'melbourne' };
  assert.equal(canArrange(event, { uid: 'current-owner' }, { role: 'user' }), true);
  assert.equal(canArrange(event, { uid: 'previous-owner' }, { role: 'user' }), false);
  assert.equal(canArrange(event, { uid: 'admin' }, { role: 'admin', adminCity: 'sydney' }), false);
  assert.equal(canArrange(event, { uid: 'admin' }, { role: 'admin', adminCity: 'melbourne' }), true);
  assert.equal(canArrange(event, { uid: 'admin' }, { role: 'admin', adminCity: 'unknown' }), false);
  assert.equal(canArrange(event, { uid: 'current-owner' }, { role: 'user', isActive: false }), false);
  assert.equal(canArrange(event, { uid: 'current-owner', isAnonymous: true }, { role: 'user' }), false);
  const params = new URLSearchParams(directoryQuery({ city: 'melbourne', category: 'Food & Catering', service: 'Niaz Preparation and supply' }));
  assert.equal(params.get('city'), 'melbourne'); assert.equal(params.get('service'), 'Niaz Preparation and supply');
});
test('event ownership cannot match two missing IDs and administrator access remains city-scoped', async () => {
  const canEdit = await component('src/utils/permissions.js', 'canEditEvent');
  const event = { createdByUserId:'owner', metroArea:'sydney', address:{suburb:'Auburn',state:'NSW',postcode:'2144'} };
  assert.equal(canEdit(null, {}, undefined), false);
  assert.equal(canEdit({role:'user'},event,'owner'), true);
  assert.equal(canEdit({role:'admin',adminCity:'melbourne'},event,'admin'), false);
  assert.equal(canEdit({role:'admin',adminCity:'sydney'},event,'admin'), true);
  assert.equal(canEdit({role:'superAdmin'},event,'super'), true);
});
test('every action has a vector icon, accessible label and actual disabled state', async () => {
  const Panel = await component('src/components/EventActionPanel.jsx');
  const actions = eventActions({event:{seriesId:'test'},member:false,manage:false,admin:false,handlers:{share(){}}});
  const html = renderToStaticMarkup(React.createElement(Panel,{actions,handlers:{share(){}}}));
  assert.equal((html.match(/<svg/g)||[]).length, actions.length);
  assert.equal((html.match(/disabled=""/g)||[]).length, actions.length - 1);
  for (const label of ['Contact Host','Reminder','Sync Calendar','Niaz Arrangement','Edit Series','Delete Series']) assert.ok(html.includes(`aria-label="${label}"`));
});
