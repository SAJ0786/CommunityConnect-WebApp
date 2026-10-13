'use strict';
exports.assertLocalBackend = function assertLocalBackend(env) {
  if (env.GCLOUD_PROJECT !== 'demo-community-connect-web'
    || env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8089'
    || env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9098') {
    throw new Error('This backend can run only with the isolated demo emulators.');
  }
};
