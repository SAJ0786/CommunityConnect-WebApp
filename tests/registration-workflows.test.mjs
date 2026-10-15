import test from 'node:test';
import assert from 'node:assert/strict';
import { createRegistrationClient, createSubmission, registrationsCsv } from '../src/registration/registrationClient.mjs';
import { answersForReview, eventDraftFromDetail, mergeRegistrationPage } from '../src/registration/registrationViewModel.mjs';
import { normalisePrivateVenue, privateVenueLinks } from '../src/registration/privateVenue.mjs';
import { accountBoundTransport } from '../src/registration/sessionTransport.mjs';
import { registrationEntry, registrationNotificationLink } from '../src/registration/registrationLinks.mjs';
import { REGISTRATION_ENABLED, CITY_MANAGEMENT_ENABLED, CITY_CATALOGUE_ENABLED } from '../src/config/releaseGates.mjs';
test('candidate features are all disabled without explicit release settings', () => {
  assert.equal(REGISTRATION_ENABLED, false); assert.equal(CITY_MANAGEMENT_ENABLED, false); assert.equal(CITY_CATALOGUE_ENABLED, false);
});
test('discovery keeps empty scanned-page cursors and requests account/review scopes explicitly', async () => {
  const calls = []; const api = createRegistrationClient(async (name, data) => { calls.push({ name, data }); return { data: { events: [], nextCursor: 'scan-next' } }; }, { enabled: true });
  const page = await api.list({ scope: 'attending', city: 'darwin' });
  assert.equal(page.nextCursor, 'scan-next'); assert.deepEqual(mergeRegistrationPage([{ id: 'kept' }], page.events), [{ id: 'kept' }]);
  await api.list({ scope: 'review', city: 'darwin', cursor: page.nextCursor });
  assert.deepEqual(calls[1].data, { scope: 'review', city: 'darwin', cursor: 'scan-next' });
});
test('account changes prevent follow-up operations and discard in-flight private results', async () => {
  let uid = 'first', resolve;
  const transport = accountBoundTransport(() => new Promise(done => { resolve = done; }), 'first', () => uid);
  const pending = transport('getRegistrationEvent', { eventId: 'event' });
  uid = 'second'; resolve({ data: { privateDetails: { address: 'private' } } });
  await assert.rejects(pending, /account changed/);
  await assert.rejects(transport('cancelRegistrationEvent', {}), /account changed/);
});
test('review preserves compatible answers but never carries consent or changed question answers forward', () => {
  const oldFields = [{ id: 'name', label: 'Name', type: 'text' }, { id: 'changed', label: 'Old', type: 'text' }, { id: 'consent', label: 'Agree', type: 'consent' }];
  const detail = { form: { fields: [oldFields[0], { ...oldFields[1], label: 'New' }, oldFields[2]] }, ownRegistration: { fields: oldFields, answers: { name: 'Attendee', changed: 'old answer', consent: true }, revision: 4 } };
  assert.deepEqual(answersForReview(detail), { name: 'Attendee', consent: false });
  const answers = { name: 'Attendee' }, submission = createSubmission('event', 2, detail.ownRegistration, answers, 2, 'stable-request');
  answers.name = 'Changed locally'; assert.equal(submission.answers.name, 'Attendee'); assert.equal(submission.expectedRevision, 4);
});
test('host and attendee cancellations use distinct revision-checked contracts', async () => {
  const calls = [], api = createRegistrationClient(async (name, data) => { calls.push({ name, data }); return { data: {} }; }, { enabled: true });
  await api.cancel('event', 4); await api.cancelEvent('event', 7, 'CANCEL EVENT'); await api.deleteAnswers('event', 'registration', 4, 'DELETE ANSWERS');
  assert.deepEqual(calls, [
    { name: 'cancelEventRegistration', data: { eventId: 'event', expectedRevision: 4 } },
    { name: 'cancelRegistrationEvent', data: { eventId: 'event', expectedRevision: 7, confirmation: 'CANCEL EVENT' } },
    { name: 'deleteRegistrationAnswers', data: { eventId: 'event', registrationId: 'registration', expectedRevision: 4, confirmation: 'DELETE ANSWERS' } },
  ]);
  assert.doesNotThrow(() => registrationsCsv([{ registrationId: 'redacted', answersDeletedAt: 'today' }]));
});
test('private maps require a valid authorised venue; event editor refuses public-only detail', () => {
  assert.equal(privateVenueLinks({ address: 'private street' }), null);
  const venue = { fullAddress: '1 Fictional Street, Parramatta NSW', suburb: 'Parramatta', state: 'NSW', postcode: '2150', latitude: -33.8, longitude: 151 };
  assert.ok(normalisePrivateVenue(venue)); assert.match(privateVenueLinks({ venue }).directions, /destination=-33.8%2C151/);
  assert.equal(privateVenueLinks({ venue: { ...venue, latitude: null } }), null);
  assert.throws(() => eventDraftFromDetail({ event: {} }, []), /can manage/);
});
test('registration links stay on this origin and enforce intended account after sign-in', () => {
  const link = registrationNotificationLink({ module: 'registration', type: 'registration.changed', eventId: 'event', recipientUid: 'member' });
  assert.equal(link, '/?registration=event&recipient=member');
  assert.equal(registrationEntry(link.slice(1), 'other'), null);
  assert.equal(registrationEntry(link.slice(1), 'member'), 'event');
  assert.equal(registrationNotificationLink({ module: 'registration', type: 'registration.changed', eventId: '../private', recipientUid: 'member' }), null);
});
