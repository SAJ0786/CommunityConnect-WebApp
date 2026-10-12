import test from 'node:test';
import assert from 'node:assert/strict';
import { createRegistrationClient, createSubmission, registrationsCsv } from '../src/registration/registrationClient.mjs';
test('client defaults off and cannot call production accidentally', async () => {
  let called = false; const client = createRegistrationClient(() => { called = true; });
  await assert.rejects(client.load('event'), /not enabled/); assert.equal(called, false);
});
test('client sends explicit revision and stable request ID; excludes inline posters from event save', async () => {
  const calls = []; const client = createRegistrationClient(async (name, data) => { calls.push({ name, data }); return { data: { ok: true } }; }, { enabled: true });
  const answers = { name: 'Demo' }; const submission = createSubmission('event', 2, { revision: 4 }, answers, 1, 'stable-1'); answers.name = 'Changed';
  await client.submit(submission); await client.submit(submission);
  assert.deepEqual(calls[0], calls[1]); assert.equal(calls[0].data.expectedRevision, 4); assert.equal(calls[0].data.answers.name, 'Demo');
  await client.save({ city: 'sydney', draft: { title: 'Demo', poster: { data: 'private' } } });
  assert.equal(calls.at(-1).data.draft.poster, undefined);
});
test('CSV uses question snapshots and neutralises spreadsheet formulas', () => {
  const csv = registrationsCsv([{ registrationId: 'demo', status: 'registered', places: 1, formVersion: 1, submittedAt: '2026-10-12', fields: [{ id: 'a', label: 'Original question' }], answers: { a: '  =HYPERLINK("malicious")' } }]);
  assert.ok(csv.includes('Original question')); assert.ok(csv.includes("'  =HYPERLINK")); assert.ok(csv.includes('""malicious""'));
});
