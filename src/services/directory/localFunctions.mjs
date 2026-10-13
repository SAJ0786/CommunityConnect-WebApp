import { assertDirectoryTestEnvironment, DIRECTORY_TEST_PROJECT, DIRECTORY_TEST_HOST, DIRECTORY_TEST_PORT } from './policy.mjs';
import { memberCallableRequest } from '../memberCallable.mjs';

export const DIRECTORY_FUNCTIONS_PORT = 5002;
export const DIRECTORY_FUNCTIONS_REGION = 'australia-southeast1';
const supported = new Set(['callWebMemberOperation', 'completeMemberRegistration', 'sendBusinessEnquiry', 'submitSupportRequest', 'submitDirectoryConversationReport', 'lookupBusinessAbnForSubmission', 'verifyBusinessAbn', 'adminDeleteUser', 'adminRestoreUser', 'listDirectoryOperations', 'decideDirectoryReport', 'archiveEventRecords', 'archiveFutureSeriesEvents', 'getEventReminder', 'setEventReminder', 'removeEventReminder']);

// Unsigned emulator token. It is generated from synthetic identities only and is
// sent exclusively to the fixed loopback Functions endpoint, never to Firebase production.
export function localIdentityToken(user) {
  if (!/^review-(member|customer|admin|super|inactive)$/.test(user?.uid || '')) throw new Error('Choose an isolated test identity.');
  const encode = value => btoa(JSON.stringify(value)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
  const now = Math.floor(Date.now() / 1000);
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ sub: user.uid, user_id: user.uid,
    aud: DIRECTORY_TEST_PROJECT, iss: `https://securetoken.google.com/${DIRECTORY_TEST_PROJECT}`,
    iat: now, exp: now + 3600, auth_time: now, email: `${user.uid.slice(7)}@example.test`, phone_number: '+61400000000',
    firebase: { sign_in_provider: 'phone', identities: {} },
  })}.`;
}

export function createLocalFunctionsTransport({ user, hostname = globalThis.location?.hostname, fetchImpl = globalThis.fetch, assertOpen = () => {} }) {
  assertDirectoryTestEnvironment({ projectId: DIRECTORY_TEST_PROJECT, hostname, host: DIRECTORY_TEST_HOST, port: DIRECTORY_TEST_PORT });
  localIdentityToken(user);
  const pending = new Set();
  let closed = false;
  const open = () => { assertOpen(); if (closed) throw new Error('This test account session has ended.'); };
  return {
    async call(name, payload) {
      open();
      if (!supported.has(name)) throw new Error('This callable is not included in the isolated backend yet.');
      const request = memberCallableRequest(name, payload);
      const controller = new AbortController();
      // Local function workers can take longer to start on Windows; keep this
      // emulator-only timeout separate from the production callable transport.
      const timer = setTimeout(() => controller.abort(), 60000);
      pending.add(controller);
      try {
        const response = await fetchImpl(`http://${DIRECTORY_TEST_HOST}:${DIRECTORY_FUNCTIONS_PORT}/${DIRECTORY_TEST_PROJECT}/${DIRECTORY_FUNCTIONS_REGION}/${request.name}`, {
          method: 'POST', credentials: 'omit', redirect: 'error', cache: 'no-store', signal: controller.signal,
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localIdentityToken(user)}` },
          body: JSON.stringify({ data: request.payload }),
        });
        open();
        const body = await response.json();
        if (body?.error) {
          const error = new Error(body.error.message || 'The isolated backend rejected this request.');
          error.code = `functions/${String(body.error.status || 'internal').toLowerCase().replaceAll('_', '-')}`;
          throw error;
        }
        if (!response.ok || !body || !Object.hasOwn(body, 'result') && !Object.hasOwn(body, 'data')) {
          throw new Error('The isolated backend returned an invalid response. Check the emulator logs before retrying.');
        }
        open();
        return Object.hasOwn(body, 'result') ? body.result : body.data;
      } catch (error) {
        if (typeof error.code === 'string' && error.code.startsWith('functions/')) throw error;
        open();
        throw new Error('The local Functions request could not be confirmed. Check the emulator and saved record before retrying.', { cause: error });
      } finally { clearTimeout(timer); pending.delete(controller); }
    },
    close() { closed = true; pending.forEach(controller => controller.abort()); pending.clear(); },
  };
}
