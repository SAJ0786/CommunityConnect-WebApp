import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { buildRuleCandidate } from './firebase-integration/ruleCandidate.mjs';
import { validRuleSubmission } from './firebase-integration/fixtures.mjs';
const root = new URL('./firebase-integration/', import.meta.url);

test('candidate is separate from the unchanged reference and default emulator configuration', async () => {
  const bytes = await fs.readFile(new URL('firestore.rules', root));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), '529fb93d87e74327365efae6bd5c8af425f3d0226152c1869a434520a59ef97d');
  const referenceConfig = JSON.parse(await fs.readFile(new URL('firebase.json', root)));
  const candidateConfig = JSON.parse(await fs.readFile(new URL('firebase.candidate.json', root)));
  assert.equal(referenceConfig.firestore.rules, 'firestore.rules');
  assert.equal(candidateConfig.firestore.rules, 'firestore.candidate.rules');
  assert.deepEqual({ ...candidateConfig, firestore: referenceConfig.firestore }, referenceConfig);
  const candidate = await fs.readFile(new URL('firestore.candidate.rules', root), 'utf8');
  assert.equal(candidate.replaceAll('\r\n', '\n'), buildRuleCandidate(bytes.toString('utf8').replaceAll('\r\n', '\n')));
});
test('candidate patch rejects source drift and leaves unrelated collections unchanged', async () => {
  const reference = (await fs.readFile(new URL('firestore.rules', root), 'utf8')).replaceAll('\r\n', '\n');
  const candidate = buildRuleCandidate(reference);
  assert.throws(() => buildRuleCandidate(reference.replace('match /publicBusinesses/', 'match /renamedBusinesses/')), /Reference rules changed/);
  const unrelatedBeforeHost = source => source.slice(source.indexOf('    match /businessStatistics/'), source.indexOf('    function isHostThreadParticipant'));
  const unrelatedAfterHost = source => source.slice(source.indexOf('    function isBusinessThreadParticipant'),source.indexOf('    function businessThreadAdminModerationOnly'));
  assert.equal(candidate.slice(candidate.indexOf('    match /businessMessageThreads/')),reference.slice(reference.indexOf('    match /businessMessageThreads/')));
  assert.equal(unrelatedBeforeHost(candidate), unrelatedBeforeHost(reference));
  assert.equal(unrelatedAfterHost(candidate), unrelatedAfterHost(reference));
  assert.equal(candidate.slice(candidate.indexOf("rules_version"), candidate.indexOf('    // Candidate:')), reference.slice(0, reference.indexOf('    function isBusinessOwner')));
});
test('inactive-account fixture includes required creation fields and differs only in owner identity', () => {
  const active = validRuleSubmission('review-member'), inactive = validRuleSubmission('review-inactive');
  // Consent timestamps are generated independently by the form payload helper.
  assert.deepEqual({ ...inactive, ownerId: active.ownerId, listingConsentAtClient: active.listingConsentAtClient }, active);
  assert.equal(typeof inactive.categoryId, 'string'); assert.ok(inactive.categoryId.length);
  assert.equal(inactive.abnVerified, false); assert.equal(inactive.foundingMember, false);
  assert.equal(inactive.status, 'pending'); assert.equal(inactive.tier, 'free');
  assert.equal(inactive.listingDeclarationAccepted, true); assert.ok(inactive.listingTermsVersion);
});
