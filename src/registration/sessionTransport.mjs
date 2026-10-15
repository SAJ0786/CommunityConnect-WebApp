// Check identity before and after every callable, including each step of a write/read sequence.
export function accountBoundTransport(call, expectedUid, currentUid) {
  const assertAccount = () => { if (!expectedUid || currentUid() !== expectedUid) throw new Error('Your account changed. Reopen registration.'); };
  return async (name, data) => { assertAccount(); const result = await call(name, data); assertAccount(); return result; };
}
