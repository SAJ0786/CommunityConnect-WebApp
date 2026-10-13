// Local emulator only. Executes historical client service code against actual rules.
// Run a Firestore emulator on 127.0.0.1:8089, then node tests/check-legacy-member-rules.cjs.
// These source baselines are NOT asserted to match the released store/Hosting builds.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { initializeApp, deleteApp } = require('firebase/app');
const firestore = require('firebase/firestore');
const root = path.resolve(__dirname, '..');
const nativeRoot = path.resolve(root, '../sdk51-package-backup');
const endpoint = 'http://127.0.0.1:8089';
const project = 'demo-web-member-compat';
const nativeRef = 'db01c17180e1a3ba9d01cafc7616b4deee3baa34^';
const webRef = '439008a';
const gitFile = (cwd, ref, file) => execFileSync('git', ['show', `${ref}:${file}`], { cwd, encoding: 'utf8' });
const nativeSource = gitFile(nativeRoot, nativeRef, 'src/services/users.js');
const webSource = gitFile(root, webRef, 'src/services/userService.js');
const rulesets = [
  { name: 'native-before-registration', rules: gitFile(nativeRoot, nativeRef, 'backend/firestore.rules'), protectedDates: false, legacyWebCreate: false },
  { name: 'native-registration-candidate', rules: fs.readFileSync(path.join(nativeRoot, 'backend/firestore.rules'), 'utf8'), protectedDates: true, legacyWebCreate: false },
  { name: 'legacy-web-repository', rules: gitFile(root, webRef, 'firestore.rules'), protectedDates: false, legacyWebCreate: true },
];
const results = [];
const apps = [];
function client(uid, source) {
  const app = initializeApp({ projectId: project, apiKey: 'synthetic-only', appId: uid }, uid);
  apps.push(app);
  const db = firestore.getFirestore(app);
  firestore.connectFirestoreEmulator(db, '127.0.0.1', 8089, { mockUserToken: {
    sub: uid, user_id: uid, firebase: { sign_in_provider: 'phone' },
  } });
  const context = { ...firestore, db, ROLES: { USER: 'user', ADMIN: 'admin', SUPER_ADMIN: 'superAdmin' } };
  const converted = source.replace(/^import[\s\S]*?from '[^']+';\s*/gm, '').replace(/\bexport\s+(?=async function|function|const)/g, '');
  // Same realm keeps Firestore's plain-object validation intact. Source is pinned local Git code.
  if (source === nativeSource) delete context.ROLES;
  const api = new Function(...Object.keys(context), converted + '\nreturn { ensureUserProfile, toggleSavedEvent' + (source === nativeSource ? ', getUserProfile, updateUserPreferences, toggleSavedBusiness' : ', updateProfile') + ' };')(...Object.values(context));
  return { uid, db, api, user: { uid, phoneNumber: '+61400000000', email: null, displayName: null } };
}
async function localRequest(route, options) {
  const response = await fetch(endpoint + route, { ...options, signal: AbortSignal.timeout(15000) });
  assert.ok(response.ok, `Emulator request failed (${response.status}): ${await response.text()}`);
}
async function trustedDates(uid) {
  const fields = Object.fromEntries(['registeredAt', 'profileCompletedAt', 'legalAcceptedAt'].map(name => [name, { timestampValue: '2026-10-01T00:00:00Z' }]));
  const mask = Object.keys(fields).map(name => 'updateMask.fieldPaths=' + name).join('&');
  await localRequest(`/v1/projects/${project}/databases/(default)/documents/users/${uid}?${mask}`, {
    method: 'PATCH', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }),
  });
}
async function outcome(label, allowed, action) {
  let actual = 'allowed';
  try { await action(); } catch (error) {
    if (error.code !== 'permission-denied') throw error;
    actual = 'denied';
  }
  assert.equal(actual, allowed ? 'allowed' : 'denied', label);
  results.push({ scenario: label, result: actual });
  console.log(`${actual.toUpperCase()}: ${label}`);
}
async function main() {
  firestore.setLogLevel('silent');
  await localRequest(`/emulator/v1/projects/${project}/databases/(default)/documents`, { method: 'DELETE' });
  for (const ruleset of rulesets) {
    await localRequest(`/emulator/v1/projects/${project}:securityRules`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content: ruleset.rules }] } }),
    });
    const prefix = ruleset.name + ': ';
    const native = client(ruleset.name + '-native', nativeSource);
    const details = { fullName: 'Synthetic Member', email: 'member@example.test', phone: '+61400000000', phoneVerified: true,
      privacyAccepted: true, privacyPolicyVersion: '2026-09-08-community-connect', termsAccepted: true,
      termsVersion: '2026-09-08-community-connect', legalAcceptedAtClient: '2026-10-01T00:00:00Z' };
    await outcome(prefix + 'old native creates profile', true, () => native.api.ensureUserProfile(native.uid, details));
    await trustedDates(native.uid); // Simulates Admin SDK fields; not a trigger integration test.
    await outcome(prefix + 'old native reopens profile with server timestamps', true, () => native.api.ensureUserProfile(native.uid, details));
    await outcome(prefix + 'old native edits contact, consent and city', true, () => native.api.updateUserPreferences(native.uid, {
      fullName: 'Updated Synthetic Member', email: 'updated@example.test', defaultCity: 'melbourne',
      termsAccepted: true, termsVersion: details.termsVersion, legalAcceptedAtClient: '2026-10-01T01:00:00Z',
    }));
    await outcome(prefix + 'old native saves event', true, () => native.api.toggleSavedEvent(native.uid, 'synthetic-event', true));
    await outcome(prefix + 'old native saves business', true, () => native.api.toggleSavedBusiness(native.uid, 'synthetic-business', true));
    const profile = await native.api.getUserProfile(native.uid);
    assert.equal(profile.registeredAt.toMillis(), Date.parse('2026-10-01T00:00:00Z'));
    assert.equal(profile.role, 'user');
    const oldWeb = client(ruleset.name + '-web-new', webSource);
    await outcome(prefix + 'old web creates profile', ruleset.legacyWebCreate, () => oldWeb.api.ensureUserProfile(oldWeb.user, details));
    const existingWeb = client(ruleset.name + '-web-existing', webSource);
    // Seed an ordinary pre-existing profile without applying client rules.
    await localRequest(`/v1/projects/${project}/databases/(default)/documents/users/${existingWeb.uid}`, {
      method: 'PATCH', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { role: { stringValue: 'user' }, isActive: { booleanValue: true }, savedEvents: { arrayValue: { values: [] } } } }),
    });
    await trustedDates(existingWeb.uid);
    await outcome(prefix + 'old web reopens existing profile', true, () => existingWeb.api.ensureUserProfile(existingWeb.user, details));
    await outcome(prefix + 'old web edits contact', true, () => existingWeb.api.updateProfile(existingWeb.uid, { fullName: 'Updated Web Member', email: 'web@example.test' }));
    await outcome(prefix + 'old web saves event', true, () => existingWeb.api.toggleSavedEvent(existingWeb.uid, 'synthetic-event', true));
    for (const field of ['registeredAt', 'profileCompletedAt', 'legalAcceptedAt']) {
      await outcome(prefix + `client overwrites ${field}`, !ruleset.protectedDates, () => firestore.updateDoc(firestore.doc(native.db, 'users', native.uid), { [field]: firestore.Timestamp.fromMillis(0) }));
    }
  }
  console.log(JSON.stringify({ assertions: results.length, project, nativeRef, webRef,
    limitations: ['Local source baselines only; released build mapping and live rules pending.', 'No live writes, SMS or deployment.', 'Server dates were seeded; no trigger integration claim.'],
    finding: 'Legacy web profile creation is denied by both native rule baselines. A broad native rules replacement is not cleared for production.' }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  await Promise.all(apps.map(deleteApp));
});
