import {
  collection, doc, getDoc, getDocFromServer, getDocs, query,
  serverTimestamp, updateDoc, where
} from 'firebase/firestore';
import { deleteUser } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getApp } from 'firebase/app';
import { auth, db } from '../firebase/firebase';
import { ROLES } from '../utils/constants';
import { memberRegistrationPayload } from '../utils/profileRegistration.mjs';

// Never manufacture a complete profile from cached/Auth fields or client roles.
export async function ensureUserProfile(user) {
  const snapshot = await getDocFromServer(doc(db, 'users', user.uid));
  return snapshot.exists() ? snapshot.data() : {};
}

export async function completeMemberProfile(user, details) {
  if (auth.currentUser?.uid !== user.uid) throw new Error('Your sign-in changed. Please try again.');
  const payload = memberRegistrationPayload(user, details);
  try {
    await httpsCallable(getFunctions(getApp(), 'australia-southeast1'), 'completeMemberRegistration')(payload);
  } catch (error) {
    if (['functions/not-found', 'functions/unavailable'].includes(error.code)) {
      throw new Error('Profile completion is currently unavailable. Please try again later or contact support.');
    }
    throw error;
  }
  if (auth.currentUser?.uid !== user.uid) throw new Error('Your sign-in changed. Please try again.');
  return ensureUserProfile(user);
}

export async function listUsers({ includeHidden = false } = {}) {
  const snap = await getDocs(collection(db, 'users'));
  const users = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const hasPhone = u => !!String(u.phone || u.phoneNumber || u.mobile || u.mobileNumber || '').trim();
  const isOldMigrated = u => !!u.migratedToUid && !(u.isActive !== false && hasPhone(u));
  return includeHidden
    ? users
    : users.filter(u => u.isActive !== false && !isOldMigrated(u));
}

export async function updateUserRole(id, role) {
  if (role !== ROLES.SUPER_ADMIN) {
    const existing = await getDocs(
      query(collection(db, 'users'), where('role', '==', ROLES.SUPER_ADMIN))
    );
    const currentIsSA = existing.docs.some(d => d.id === id && d.data().role === ROLES.SUPER_ADMIN);
    if (currentIsSA && existing.docs.length <= 1) {
      throw new Error('At least one Super Admin must remain in the system.');
    }
  }
  return updateDoc(doc(db, 'users', id), { role, updatedAt: serverTimestamp() });
}

export async function updateReminderPreference(uid, enabled) {
  return updateDoc(doc(db, 'users', uid), {
    reminderEmailEnabled: enabled,
    updatedAt: serverTimestamp()
  });
}

export async function updatePushPreference(uid, enabled) {
  return updateDoc(doc(db, 'users', uid), {
    pushNotificationsEnabled: enabled,
    updatedAt: serverTimestamp()
  });
}

export async function updateAdminAlertPreference(uid, enabled) {
  return updateDoc(doc(db, 'users', uid), {
    adminAlertEmailEnabled: enabled,
    updatedAt: serverTimestamp()
  });
}

export async function updateProfile(uid, data) {
  return updateDoc(doc(db, 'users', uid), { ...data, updatedAt: serverTimestamp() });
}

export async function updateUserContactProfile(targetUid, fullName, email) {
  const fns = getFunctions(getApp(), 'australia-southeast1');
  const result = await httpsCallable(fns, 'updateUserContactProfile')({
    targetUid,
    fullName,
    email,
  });
  return result.data?.profile;
}

export async function getSavedEvents(uid) {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    return snap.exists() ? (snap.data()?.savedEvents || []) : [];
  } catch { return []; }
}

export async function toggleSavedEvent(uid, eventId, save) {
  const ref  = doc(db, 'users', uid);
  const snap = await getDoc(ref);
  const current = snap.exists() ? (snap.data()?.savedEvents || []) : [];
  const updated = save
    ? [...new Set([...current, eventId])]
    : current.filter(id => id !== eventId);
  return updateDoc(ref, { savedEvents: updated, updatedAt: serverTimestamp() });
}

export async function deleteMyAccountAndEvents(currentUser, archiveEventsNow = false) {
  const fns = getFunctions(getApp(), 'australia-southeast1');
  await httpsCallable(fns, 'deleteUserData')({ archiveEventsNow });
  await deleteUser(currentUser);
}
