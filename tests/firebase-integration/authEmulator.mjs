import { createRequire } from 'node:module';
import { assertLocalBackend } from './functions/isolation.cjs';
import { identities } from './fixtures.mjs';
const require = createRequire(new URL('./functions/package.json', import.meta.url));
let auth;
export function localAuth() {
  assertLocalBackend(process.env);
  if (!auth) {
    const { initializeApp } = require('firebase-admin/app');
    const { getAuth } = require('firebase-admin/auth');
    auth = getAuth(initializeApp({ projectId: 'demo-community-connect-web' }, 'isolated-auth-fixtures'));
  }
  return auth;
}
export async function seedAuth() {
  const client = localAuth();
  for (const [name, identity] of Object.entries(identities)) {
    const fields = { email: identity.email, displayName: `Test ${name}`, disabled: name === 'inactive' };
    try { await client.updateUser(identity.uid, fields); }
    catch (error) {
      if (error.code !== 'auth/user-not-found') throw error;
      await client.createUser({ uid: identity.uid, ...fields });
    }
  }
}
