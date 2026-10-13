import { DIRECTORY_TEST_PROJECT, DIRECTORY_TEST_HOST, DIRECTORY_TEST_PORT } from '../../src/services/directory/policy.mjs';
export const origin = `http://${DIRECTORY_TEST_HOST}:${DIRECTORY_TEST_PORT}`;
const database = `projects/${DIRECTORY_TEST_PROJECT}/databases/(default)`;
const base = `${origin}/v1/${database}/documents`;

export function token(uid) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ sub: uid, user_id: uid,
    aud: DIRECTORY_TEST_PROJECT, iss: `https://securetoken.google.com/${DIRECTORY_TEST_PROJECT}`, iat: now, exp: now + 3600, auth_time: now,
    firebase: { sign_in_provider: 'phone', identities: {} }, phone_number: '+61400000000',
  })}.`;
}
function value(data) {
  if (data === null) return { nullValue: null };
  if (data instanceof Date) return { timestampValue: data.toISOString() };
  if (Array.isArray(data)) return { arrayValue: { values: data.map(value) } };
  if (typeof data === 'boolean') return { booleanValue: data };
  if (typeof data === 'number') return Number.isInteger(data) ? { integerValue: String(data) } : { doubleValue: data };
  if (typeof data === 'object') return { mapValue: { fields: fields(data) } };
  return { stringValue: String(data) };
}
const fields = data => Object.fromEntries(Object.entries(data).map(([key, item]) => [key, value(item)]));
export async function request(path, { uid, method = 'GET', body, admin = false, mask = [], timeoutMs = 15000 } = {}) {
  if (process.env.FIRESTORE_EMULATOR_HOST && process.env.FIRESTORE_EMULATOR_HOST !== `${DIRECTORY_TEST_HOST}:${DIRECTORY_TEST_PORT}`) throw new Error('Unexpected emulator endpoint.');
  const url = new URL(`${base}/${path}`);
  mask.forEach(key => url.searchParams.append('updateMask.fieldPaths', key));
  const response = await fetch(url, { method, headers: {
    'Content-Type': 'application/json', ...(admin ? { Authorization: 'Bearer owner' } : uid ? { Authorization: `Bearer ${token(uid)}` } : {}),
  }, ...(body ? { body: JSON.stringify({ fields: fields(body) }) } : {}), signal: AbortSignal.timeout(timeoutMs) });
  return { status: response.status, data: await response.json() };
}

export async function commit(writes, { uid } = {}) {
  if (process.env.FIRESTORE_EMULATOR_HOST && process.env.FIRESTORE_EMULATOR_HOST !== `${DIRECTORY_TEST_HOST}:${DIRECTORY_TEST_PORT}`) throw new Error('Unexpected emulator endpoint.');
  const body = { writes: writes.map(({ path, body, remove = false }) => remove
    ? { delete: `${database}/documents/${path}` }
    : { update: { name: `${database}/documents/${path}`, fields: fields(body) } }) };
  const response = await fetch(`${base}:commit`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token(uid)}` },
    body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
  return { status: response.status, data: await response.json() };
}

// Probe an actual read before fixture writes. A listening port does not mean the
// emulator's database/rules runtime has finished its first-request startup.
export async function waitForFirestore({ timeoutMs = 60000,
  probe = remaining => request('publicBusinesses', { admin: true, timeoutMs: Math.min(15000, remaining) }),
  now = Date.now, delay = ms => new Promise(resolve => setTimeout(resolve, ms)),
} = {}) {
  const deadline = now() + timeoutMs;
  let lastError;
  do {
    let result;
    try { result = await probe(Math.max(1, deadline - now())); }
    catch (error) { lastError = error; }
    if (result?.status === 200) return;
    if (result && result.status < 500) throw new Error(`Firestore emulator readiness check returned HTTP ${result.status}. Check its configuration before running permission tests.`);
    if (result) lastError = new Error(`HTTP ${result.status}`);
    if (now() >= deadline) break;
    await delay(Math.min(500, deadline - now()));
  } while (now() < deadline);
  throw new Error('Firestore emulator did not become ready before the setup timeout. Permission tests have not run.', { cause: lastError });
}
export async function seed(records) {
  for (const [path, body] of Object.entries(records)) {
    const result = await request(path, { admin: true, method: 'PATCH', body });
    if (result.status !== 200) throw new Error(`Could not seed ${path}: ${result.data.error?.message || result.status}`);
  }
}
