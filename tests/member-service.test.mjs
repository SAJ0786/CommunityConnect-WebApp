import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { memberRegistrationPayload } from '../src/utils/profileRegistration.mjs';
const member = { uid: 'test', phoneNumber: '+61400000000' };
const details = { fullName: 'Test Member', email: 'test@example.com', privacyAccepted: true, termsAccepted: true, defaultCity: 'sydney' };

function service({ profile = {}, fail, duringCall } = {}) {
  const calls = [];
  const auth = { currentUser: member };
  const context = { auth, db: {}, memberRegistrationPayload,
    doc: (_, collection, uid) => ({ collection, uid }),
    getDocFromServer: async ref => { calls.push(['read', ref]); return { exists: () => profile !== null, data: () => profile }; },
    getFunctions: (_, region) => { assert.equal(region, 'australia-southeast1'); return {}; },
    getApp: () => ({}),
    httpsCallable: (_, name) => async payload => {
      calls.push([name, payload]);
      if (duringCall) duringCall(auth);
      if (fail) throw fail;
      return { data: { completed: true } };
    },
  };
  const source = fs.readFileSync('src/services/userService.js', 'utf8')
    .replace(/^import[\s\S]*?from '[^']+';\s*/gm, '').replace(/export /g, '');
  vm.runInNewContext(source + '\nthis.api = { ensureUserProfile, completeMemberProfile };', context);
  return { ...context.api, calls, auth };
}

test('actual web service calls native completion contract and then rereads server profile', async () => {
  const saved = { ...details, role: 'admin', registeredAt: { seconds: 1234 } };
  const api = service({ profile: saved });
  assert.equal(await api.completeMemberProfile(member, { ...details, role: 'superAdmin', uid: 'other' }), saved);
  assert.equal(api.calls[0][0], 'completeMemberRegistration');
  assert.deepEqual(api.calls[0][1], memberRegistrationPayload(member, details));
  assert.equal(api.calls[1][0], 'read');
  assert.equal(api.calls[1][1].uid, member.uid);
});

test('missing profiles remain incomplete and unavailable callable never falls back to client writes', async () => {
  const missing = service({ profile: null });
  assert.equal(Object.keys(await missing.ensureUserProfile(member)).length, 0);
  for (const code of ['functions/not-found', 'functions/unavailable', 'functions/permission-denied']) {
    const api = service({ fail: Object.assign(new Error('Denied'), { code }) });
    await assert.rejects(api.completeMemberProfile(member, details));
    assert.equal(api.calls.length, 1);
  }
});

test('identity changes before or during completion cannot continue as the old user', async () => {
  const before = service();
  before.auth.currentUser = { uid: 'other' };
  await assert.rejects(before.completeMemberProfile(member, details), /sign-in changed/);
  assert.equal(before.calls.length, 0);
  const during = service({ duringCall: auth => { auth.currentUser = null; } });
  await assert.rejects(during.completeMemberProfile(member, details), /sign-in changed/);
  assert.equal(during.calls.length, 1);
});
