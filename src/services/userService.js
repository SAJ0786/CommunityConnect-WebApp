import {
  collection, doc, getDoc, getDocs, query,
  serverTimestamp, setDoc, updateDoc, where
} from 'firebase/firestore';
import { deleteUser } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getApp } from 'firebase/app';
import { db } from '../firebase/firebase';
import { ROLES } from '../utils/constants';

// ── IMPORTANT: Set your Super Admin email here ─────────────────────────────────
// On first login this email will automatically get superAdmin role.
const SUPER_ADMIN_EMAILS = ['sajjadzaheer@gmail.com', 'communityeventstester@outlook.com'];
const isSuperAdminEmail = email => SUPER_ADMIN_EMAILS.includes(String(email || '').trim().toLowerCase());

export async function ensureUserProfile(user, extraData = {}) {
  const ref  = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);

  // ── Account linking: phone user matched to existing Google/Microsoft account ──
  // extraData._linkedFrom = the old UID (Google/Microsoft account)
  // We copy the old profile to the new phone UID, preserving role/events/etc.
  if (extraData._linkedFrom && extraData._linkedFrom !== user.uid) {
    const oldRef  = doc(db, 'users', extraData._linkedFrom);
    const oldSnap = await getDoc(oldRef);
    if (oldSnap.exists()) {
      const oldData = oldSnap.data();
      const merged  = {
        ...oldData,
        phone:     user.phoneNumber || '',
        updatedAt: serverTimestamp(),
        linkedFrom: extraData._linkedFrom,
        walkthroughCompleted: oldData.walkthroughCompleted ?? true,
      };
      // Write new profile under phone UID
      await setDoc(ref, merged, { merge: true });
      // Mark the old profile as migrated (so it still exists but is inactive)
      await updateDoc(oldRef, {
        migratedToUid: user.uid,
        migratedAt:    serverTimestamp(),
        isActive:      false,
      }).catch(() => {});
      return merged;
    }
  }

  if (!snap.exists()) {
    const profileEmail = (extraData.email || user.email || '').trim().toLowerCase();
    const role = isSuperAdminEmail(profileEmail) ? ROLES.SUPER_ADMIN : ROLES.USER;
    // extraData contains name/email from registration form — use them first
    const p = {
      fullName: extraData.fullName || user.displayName || user.email?.split('@')[0] || '',
      email:    profileEmail,
      emailLower: profileEmail,
      phone:    user.phoneNumber   || extraData.phone || '',
      role,
      isActive: true,
      reminderEmailEnabled: true,
      adminAlertEmailEnabled: true,
      privacyAccepted: true,
      privacyAcceptedAt: serverTimestamp(),
      termsAccepted: true,
      termsAcceptedAt: serverTimestamp(),
      walkthroughCompleted: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    await setDoc(ref, p);
    return p;
  }

  // Update phone/email if missing
  const existingData = snap.data();
  const updates = {};
  if (!existingData.phone?.trim() && user.phoneNumber) updates.phone = user.phoneNumber;
  if (!existingData.email && extraData.email) {
    updates.email = extraData.email.trim().toLowerCase();
    updates.emailLower = updates.email;
  } else if (existingData.email && !existingData.emailLower) {
    updates.emailLower = String(existingData.email).trim().toLowerCase();
  }
  if (!existingData.fullName && extraData.fullName) updates.fullName = extraData.fullName;
  // Profiles created before account-level tour tracking are existing users.
  // Mark them complete so updates or new devices never replay the tour.
  if (existingData.walkthroughCompleted === undefined) updates.walkthroughCompleted = true;
  if (Object.keys(updates).length > 0) {
    await updateDoc(ref, { ...updates, updatedAt: serverTimestamp() });
    return { ...existingData, ...updates };
  }

  // If existing user with superAdmin email somehow got downgraded, fix it
  const data = existingData;
  const existingEmail = String(data.email || user.email || '').trim().toLowerCase();
  if (isSuperAdminEmail(existingEmail) && data.role !== ROLES.SUPER_ADMIN) {
    await updateDoc(ref, { role: ROLES.SUPER_ADMIN, updatedAt: serverTimestamp() });
    return { ...data, role: ROLES.SUPER_ADMIN };
  }

  return data;
}

export async function listUsers() {
  const snap = await getDocs(collection(db, 'users'));
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(u => u.isActive !== false && !u.migratedToUid);
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
