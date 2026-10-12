import { getFunctions, httpsCallable } from 'firebase/functions';
import { createRegistrationClient } from './registrationClient.mjs';

// The owning web chat must mount this only after feature/backend acceptance.
// An explicit Firebase app also allows isolated emulator wiring without globals.
export function firebaseRegistration(app, { enabled = false, functionsInstance } = {}) {
  const functions = functionsInstance || getFunctions(app, 'australia-southeast1');
  return createRegistrationClient((name, data) => httpsCallable(functions, name)(data), { enabled });
}
