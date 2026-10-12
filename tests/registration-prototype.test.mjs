import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createDraft, makeField, moveField, validateDraft, validateAnswers, snapshotBooking, FIELD_TYPES, consentLast, TERMS_LIMIT, publicEvent, templateFields, FORM_TEMPLATES } from '../src/registration/prototypeModel.mjs';
const valid = () => ({ ...createDraft(), date: '2026-12-01', address: '1 Fictional Street, Parramatta NSW', suburb: 'Parramatta' });
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

test('closing date must be a valid earlier calendar day, not same-day earlier time', () => {
  for (const closes of ['2026-12-01T00:00', '2026-12-02T00:00', '2026-02-30T12:00', '2026-11-30T25:00']) assert.ok(validateDraft({ ...valid(), closes }).some(message => message.includes('closing')));
  assert.deepEqual(validateDraft({ ...valid(), closes: '2026-11-30T23:59' }), []);
});

test('consent requires bounded terms and stays at the end when questions are added or moved', () => {
  const consent = makeField('consent', 'terms');
  assert.ok(validateDraft({ ...valid(), fields: [consent] }).some(message => message.includes('terms')));
  consent.terms = 'Agree to arrive at the scheduled time.';
  const fields = consentLast([consent, makeField('text', 'new')]);
  assert.equal(fields.at(-1).id, 'terms');
  assert.equal(moveField(fields, 1, -1), fields);
  assert.deepEqual(validateDraft({ ...valid(), fields }), []);
  consent.terms = 'x'.repeat(TERMS_LIMIT + 1);
  assert.ok(validateDraft({ ...valid(), fields: [consent] }).length);
});

test('public card excludes address and poster; templates remain independently editable', () => {
  const draft = { ...valid(), poster: { data: 'private' } };
  assert.equal(publicEvent(draft).address, undefined);
  assert.equal(publicEvent(draft).poster, undefined);
  assert.equal(publicEvent(draft).eventType, 'Workshop');
  const fields = templateFields(FORM_TEMPLATES[0]); fields[0].label = 'Changed'; fields.push(makeField('text', 'extra'));
  assert.equal(templateFields(FORM_TEMPLATES[0])[0].label, 'Full name');
});
