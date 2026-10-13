import { memberRegistrationPayload } from '../../src/utils/profileRegistration.mjs';
const listeners = new Set();
const member = { uid: 'synthetic-member', phoneNumber: '+61400000000', providerData: [{ providerId: 'phone' }] };
const scenario = new URLSearchParams(location.search).get('scenario') || 'missing';
const persisted = JSON.parse(sessionStorage.getItem('synthetic-profile') || 'null');
let profile = persisted || (scenario === 'complete' ? { fullName: 'Existing Member', email: 'member@example.com', role: 'user' }
  : scenario === 'inactive' ? { fullName: 'Inactive Member', email: 'member@example.com', isActive: false } : {});
export const auth = { currentUser: scenario === 'signed-out' ? null : scenario === 'guest' ? { uid: 'synthetic-guest', isAnonymous: true } : member };
export const functions = {};
export const firebaseConfigured = true;
export const onAuthStateChanged = (_, listener) => { listeners.add(listener); queueMicrotask(() => { if (listeners.has(listener)) listener(auth.currentUser); }); return () => listeners.delete(listener); };
const notify = () => listeners.forEach(listener => listener(auth.currentUser));
export const signOut = async () => { auth.currentUser = null; notify(); };
window.__syntheticSignOut = signOut;
export const signInAnonymously = async () => { auth.currentUser = { uid: 'synthetic-guest', isAnonymous: true }; notify(); };
export const setPersistence = async () => {};
export const browserLocalPersistence = {};
export class RecaptchaVerifier { render() { return Promise.resolve(1); } clear() {} }
export const signInWithPhoneNumber = async () => ({ confirm: async () => { auth.currentUser = member; notify(); return { user: member }; } });
export const httpsCallable = () => async () => ({ data: {} });
export const ensureUserProfile = async () => {
  if (scenario === 'read-fail' && !window.__allowProfileRead) throw new Error('Synthetic read failure');
  await new Promise(resolve => setTimeout(resolve, scenario === 'slow' ? 600 : 20));
  return profile;
};
export const completeMemberProfile = async (user, data) => {
  window.__saveCount = (window.__saveCount || 0) + 1;
  const payload = memberRegistrationPayload(user, data);
  await new Promise(resolve => setTimeout(resolve, 120));
  if (window.__failSave) throw new Error('Synthetic save failure');
  profile = { ...profile, ...payload, role: profile.role || 'user', phone: user.phoneNumber };
  sessionStorage.setItem('synthetic-profile', JSON.stringify(profile));
  return profile;
};
export const updateProfile = async () => {};
export const deleteEvent = async () => {};
export const getActiveEvents = async () => [];
export const listenLiveEvents = () => () => {};
export const saveNativePushToken = async () => {};
export const startForegroundPushNotifications = async () => {};
export const syncGrantedNotificationToken = async () => {};
