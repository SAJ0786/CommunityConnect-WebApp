export const blockedExports = {
  firestore: ['addDoc','setDoc','updateDoc','deleteDoc','writeBatch','runTransaction'],
  storage: ['uploadBytes','uploadBytesResumable','uploadString','deleteObject','updateMetadata'],
  auth: ['createUserWithEmailAndPassword','deleteUser','updateProfile','updateEmail','updatePassword','updatePhoneNumber','verifyBeforeUpdateEmail','linkWithCredential','linkWithPhoneNumber','linkWithPopup','linkWithRedirect','unlink','sendPasswordResetEmail','sendEmailVerification','signInAnonymously'],
  functions: ['httpsCallable','httpsCallableFromURL'],
  messaging: ['getToken','deleteToken','onMessage','isSupported'],
};
export const errorMessage = 'This local preview is read-only. Changes, uploads and account registration are disabled.';
export function notificationPreviewModule(source) {
  const names = [...source.matchAll(/export\s+(?:async\s+)?(?:function|const)\s+(\w+)/g)].map(match => match[1]);
  return names.map(name => `export const ${name} = ${name === 'getNotificationPermissionState'
    ? "() => ({supported:false,permission:'unsupported',native:false})"
    : 'async () => null'};`).join('\n');
}
export function guardSdk(sdk, kind) {
  const denied = () => { const error = new Error(errorMessage); error.code = 'preview/read-only'; throw error; };
  const overrides = Object.fromEntries((blockedExports[kind] || []).map(name => [name, denied]));
  if (kind === 'auth') overrides.setPersistence = auth => sdk.setPersistence(auth, sdk.browserSessionPersistence);
  if (kind === 'functions') overrides.httpsCallable = (instance, name, options) => {
    // Audited public event reader; every other callable is disabled here.
    if (name !== 'getPublicEvents') return async () => denied();
    return sdk.httpsCallable(instance, name, options);
  };
  if (kind === 'messaging') {
    overrides.isSupported = async () => false;
    overrides.onMessage = () => () => {};
  }
  return { ...sdk, ...overrides };
}
