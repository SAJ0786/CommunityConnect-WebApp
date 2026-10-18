import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { memberRegistrationPayload } from '../src/utils/profileRegistration.mjs';

test('all active web screens use defined central colour tokens', () => {
  const tokens = fs.readFileSync('src/styles/tokens.css', 'utf8');
  const definitions = new Set([...tokens.matchAll(/(--cc-[\w-]+)\s*:/g)].map(match => match[1]));
  const files = fs.readdirSync('src', { recursive: true }).filter(file => /\.(jsx|css)$/.test(file) && !file.includes('-SIZA_PC') && !file.endsWith('tokens.css'));
  for (const relative of files) {
    const file = 'src/' + relative;
    const source = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /#[\da-f]{3,8}\b|rgba?\(\s*\d|hsla?\(\s*\d/i, file);
    for (const [, name] of source.matchAll(/var\((--cc-[\w-]+)/g)) assert.ok(definitions.has(name), `${file}: undefined ${name}`);
  }
});
test('shared web palette retains native blue and maps legacy accents to blue', () => {
  const native = fs.readFileSync('../sdk51-package-backup/src/theme.js', 'utf8');
  const css = fs.readFileSync('src/styles/tokens.css', 'utf8');
  for (const [webName, nativeName] of [['primary', 'blue'], ['primary-strong', 'blueDark'], ['text', 'text']]) {
    const color = native.match(new RegExp(`\\b${nativeName}: '([^']+)'`))[1];
    assert.ok(css.includes(`--cc-${webName}: ${color};`));
  }
  assert.ok(css.includes('--cc-accent: var(--cc-primary);'));
  assert.ok(css.includes('--cc-accent-strong: var(--cc-primary-strong);'));
  assert.ok(css.includes('--cc-accent-soft: var(--cc-primary-soft);'));
  assert.doesNotMatch(css, /--cc-success:\s*var\(--cc-(accent|primary)/);
  const published = fs.readFileSync('public/theme-tokens.css', 'utf8');
  assert.equal(published.slice(published.indexOf('\n') + 1), css);
});
test('registration payload sends only contact and consent, never client authority', () => {
  const data = memberRegistrationPayload({ uid: 'test', phoneNumber: '+61400000000' }, {
    fullName: ' Test   Member ', email: 'ADMIN@EXAMPLE.COM', privacyAccepted: true, termsAccepted: true,
    uid: 'another', role: 'superAdmin', phone: '+61499999999', registeredAt: 'injected', _linkedFrom: 'another-account',
  });
  assert.equal(data.email, 'admin@example.com');
  assert.equal(data.fullName, 'Test Member');
  assert.deepEqual(Object.keys(data).sort(), ['email', 'fullName', 'legalVersion', 'privacyAccepted', 'termsAccepted']);
  assert.equal(data.legalVersion, '2026-09-08-community-connect');
});

test('registration requires a verified mobile, valid details and explicit consent', () => {
  const user = { uid: 'test', phoneNumber: '+61400000000' };
  const details = { fullName: 'Test Member', email: 'test@example.com', privacyAccepted: true, termsAccepted: true };
  assert.throws(() => memberRegistrationPayload({ ...user, isAnonymous: true }, details), /registered sign-in/);
  assert.throws(() => memberRegistrationPayload({ uid: 'test' }, details), /Verify/);
  for (const bad of [{ fullName: 'A' }, { fullName: 'a'.repeat(121) }, { email: 'bad' }, { email: 'a'.repeat(255) + '@example.com' }, { privacyAccepted: false }, { termsAccepted: false }]) {
    assert.throws(() => memberRegistrationPayload(user, { ...details, ...bad }));
  }
});

test('web completion uses the native callable and never creates client-owned registration dates', () => {
  const source = fs.readFileSync('src/services/userService.js', 'utf8');
  assert.match(source, /completeMemberRegistration/);
  assert.match(source, /getDocFromServer/);
  assert.doesNotMatch(source, /setDoc|newMemberProfile/);
  const auth = fs.readFileSync('src/pages/AuthPage.jsx', 'utf8');
  assert.doesNotMatch(auth, /lookupPhoneAccountByEmail|migratePhoneAccountByEmail|fbUpdateProfile/);
  const app = fs.readFileSync('src/App.jsx', 'utf8');
  assert.ok(app.includes('memberEntryState(user, profileVerified ? profile : null, profileLoading)'));
  assert.ok(app.indexOf('return <CompleteMemberProfile') < app.indexOf('const shared'));
  assert.doesNotMatch(app, /buildFallbackProfile|readProfileCache/);
});
