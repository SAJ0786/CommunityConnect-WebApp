import { initializeApp, deleteApp } from 'firebase/app';
import { initializeFirestore, connectFirestoreEmulator, terminate } from 'firebase/firestore';
import * as sdk from 'firebase/firestore';
import * as storageSdk from 'firebase/storage';
import { createDirectoryGateway } from './gateway.mjs';
import { createDirectoryImageService } from './images.mjs';
import { createLocalFunctionsTransport } from './localFunctions.mjs';
import { assertDirectoryTestEnvironment, DIRECTORY_TEST_PROJECT, DIRECTORY_TEST_HOST, DIRECTORY_TEST_PORT, DIRECTORY_STORAGE_PORT, DIRECTORY_STORAGE_BUCKET } from './policy.mjs';

export function createLocalDirectorySession(user, hostname = globalThis.location?.hostname) {
  assertDirectoryTestEnvironment({ projectId: DIRECTORY_TEST_PROJECT, hostname, host: DIRECTORY_TEST_HOST, port: DIRECTORY_TEST_PORT });
  if (!/^review-(member|customer|admin|super|inactive)$/.test(user?.uid || '')) throw new Error('Choose an isolated test identity.');
  const app = initializeApp({ projectId: DIRECTORY_TEST_PROJECT, storageBucket: DIRECTORY_STORAGE_BUCKET, apiKey: 'local-emulator-only', appId: 'local-directory-rehearsal' }, `directory-${user.uid}-${crypto.randomUUID()}`);
  const db = initializeFirestore(app, { experimentalForceLongPolling: true });
  // Emulator-only token, never a real sign-in or SMS. No Firebase Auth singleton.
  const mockUserToken = {
    sub: user.uid, email: user.email, phone_number: user.phoneNumber, firebase: { sign_in_provider: 'phone', identities: {} },
  };
  connectFirestoreEmulator(db, DIRECTORY_TEST_HOST, DIRECTORY_TEST_PORT, { mockUserToken });
  const bucket = storageSdk.getStorage(app);
  storageSdk.connectStorageEmulator(bucket, DIRECTORY_TEST_HOST, DIRECTORY_STORAGE_PORT, { mockUserToken });
  bucket.maxUploadRetryTime = 10000;
  bucket.maxOperationRetryTime = 10000;
  let disposed = false;
  const assertOpen = () => { if (disposed) throw new Error('This test account session has ended.'); };
  const images = createDirectoryImageService({ bucket, uid: user.uid, sdk: storageSdk, assertOpen });
  const functions = createLocalFunctionsTransport({ user, hostname, assertOpen });
  const gateway = createDirectoryGateway({ db, user, sdk, images, assertOpen, operationsEnabled: true, callFunction: functions.call });
  return { ...gateway, async close() { disposed = true; functions.close(); gateway.close(); await terminate(db); await deleteApp(app); } };
}
