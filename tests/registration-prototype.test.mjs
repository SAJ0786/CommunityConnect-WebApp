import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createDraft, makeField, moveField, validateDraft, validateAnswers, snapshotBooking, FIELD_TYPES } from '../src/registration/prototypeModel.mjs';
const valid = () => ({ ...createDraft(), date: '2026-12-01' });
test('native and web contracts are identical', context => {
  if (!fs.existsSync(new URL('../../sdk51-package-backup/src/registration/prototypeModel.js', import.meta.url))) { context.skip('Sibling native checkout is not present.'); return; }
  assert.equal(fs.readFileSync(new URL('../src/registration/prototypeModel.mjs', import.meta.url), 'utf8'), fs.readFileSync(new URL('../../sdk51-package-backup/src/registration/prototypeModel.js', import.meta.url), 'utf8'));
});
test('drafts and standard fields are independent', () => {
  const first = valid(); first.fields[0].label = 'Changed'; assert.equal(valid().fields[0].label, 'Full name');
  assert.deepEqual(validateDraft(valid()), []);
});
test('draft validation rejects invalid capacity and duplicate options', () => {
  for (const capacity of [0, -1, 1.5, 10001, 'not a number']) assert.ok(validateDraft({ ...valid(), capacity }).length);
  const choice = makeField('select', 'choice'); choice.options = ['same', 'same'];
  assert.ok(validateDraft({ ...valid(), fields: [choice] }).some(e => e.includes('options')));
  assert.ok(validateDraft(createDraft()).some(e => e.includes('date')));
});
test('reordering preserves stable IDs and does not mutate input', () => {
  const fields = valid().fields; const result = moveField(fields, 0, 1);
  assert.equal(fields[0].id, 'name'); assert.equal(result[1].id, 'name');
  assert.equal(moveField(fields, 0, -1), fields);
});
test('required answers, places and input types are validated', () => {
  const draft = valid(); assert.equal(Object.keys(validateAnswers(draft.fields, {}, 1, 30)).length, 3);
  const answers = { name: 'Demo Attendee', email: 'demo@example.com', phone: '+61400000000' };
  assert.deepEqual(validateAnswers(draft.fields, answers, 3, 30), {});
  assert.ok(validateAnswers(draft.fields, answers, 31, 30).places);
  assert.ok(validateAnswers(draft.fields, { ...answers, email: 'bad' }, 3, 30).email);
});
test('choice and consent answers reject arbitrary values', () => {
  const field = { ...makeField('checkboxes', 'options'), required: true };
  assert.ok(validateAnswers([field], { options: ['unknown'] }, 1, 30).options);
  assert.deepEqual(validateAnswers([field], { options: ['Option 1'] }, 1, 30), {});
  assert.ok(validateAnswers([{ ...makeField('consent', 'consent'), required: true }], { consent: false }, 1, 30).consent);
  assert.equal(FIELD_TYPES.length, 10);
});
test('response snapshot retains original questions after edits', () => {
  const draft = valid(); const answers = { name: 'Demo' }; const booking = snapshotBooking(draft, answers, 2);
  draft.fields[0].label = 'Changed'; answers.name = 'Different';
  assert.equal(booking.fields[0].label, 'Full name'); assert.equal(booking.answers.name, 'Demo'); assert.equal(booking.places, 2);
});
test('preview entry has no live transport or persistence', () => {
  const source = fs.readFileSync(new URL('../src/registration/RegistrationPrototype.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /from ['"].*firebase|fetch\(|localStorage|sessionStorage|httpsCallable|addDoc\(/);
  if (!fs.existsSync(new URL('../../sdk51-package-backup/src/components/RegistrationPrototypeScreen.js', import.meta.url))) return;
  const native = fs.readFileSync(new URL('../../sdk51-package-backup/src/components/RegistrationPrototypeScreen.js', import.meta.url), 'utf8');
  assert.doesNotMatch(native, /from ['"].*firebase|httpsCallable|addDoc\(/);
  const app = fs.readFileSync(new URL('../../sdk51-package-backup/App.js', import.meta.url), 'utf8');
  assert.match(app, /registrationPreviewEnabled=\{__DEV__\}/);
});
