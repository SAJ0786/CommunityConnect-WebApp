'use strict';
exports.register = function ({ admin, db, onCall, HttpsError, REGION }) {
const exports = {};
const DEFAULT_CITY = 'sydney';
function city(value) {
  return String(value || DEFAULT_CITY).trim().toLowerCase();
}

function userCity(user = {}) {
  return city(user.adminCity || user.defaultCity);
}

function eventCity(event = {}) {
  return city(event.metroArea || event.city || event.address?.city);
}

function adminCanAccessEvent(caller = {}, event = {}) {
  return caller.role === 'superAdmin' || (caller.role === 'admin' && eventCity(event) === userCity(caller));
}

function adminCanAccessUser(caller = {}, target = {}) {
  return caller.role === 'superAdmin' || (caller.role === 'admin' && userCity(target) === userCity(caller));
}

async function callerProfile(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login required.');
  const snapshot = await db.collection('users').doc(request.auth.uid).get();
  return snapshot.data() || {};
}
exports.adminDeleteUser = onCall({ region: REGION }, async request => {
  const caller = await callerProfile(request);
  if (!['admin', 'superAdmin'].includes(caller.role)) throw new HttpsError('permission-denied', 'Admin access required.');
  const targetUid = String(request.data?.targetUid || '').trim();
  const ban = request.data?.ban === true;
  if (!targetUid || targetUid === request.auth.uid) throw new HttpsError('invalid-argument', 'Choose another user.');
  const targetDoc = await db.collection('users').doc(targetUid).get();
  if (!targetDoc.exists) throw new HttpsError('not-found', 'User not found.');
  const target = targetDoc.data() || {};
  if (!adminCanAccessUser(caller, target) || (caller.role === 'admin' && target.role !== 'user')) throw new HttpsError('permission-denied', 'You cannot manage this user.');
  if (target.role === 'superAdmin') {
    const active = await db.collection('users').where('role', '==', 'superAdmin').where('isActive', '==', true).get();
    if (active.size <= 1) throw new HttpsError('failed-precondition', 'Cannot archive the only Super Admin.');
  }
  const events = await db.collection('events').where('createdByUserId', '==', targetUid).get();
  const archivedAt = admin.firestore.Timestamp.now();
  for (let offset = 0; offset < events.docs.length; offset += 240) {
    const batch = db.batch();
    events.docs.slice(offset, offset + 240).forEach(eventDoc => {
      batch.set(db.collection('archivedEvents').doc(eventDoc.id), { ...eventDoc.data(), status: 'inactive', creatorDeleted: true, accountDeletedAt: archivedAt, archivedAt, archivedFromEventId: eventDoc.id, archiveReason: ban ? 'creator_account_banned' : 'creator_account_archived_by_admin', archivedBy: request.auth.uid }, { merge: true });
      batch.delete(eventDoc.ref);
    });
    await batch.commit();
  }
  const accountStatus = ban ? 'banned' : 'deleted';
  const batch = db.batch();
  batch.set(db.collection('archivedUsers').doc(targetUid), { ...target, uid: targetUid, accountStatus, isActive: false, archivedAt, archivedBy: request.auth.uid, archiveReason: ban ? 'admin_ban' : 'admin_account_archive' }, { merge: true });
  batch.set(db.collection('users').doc(targetUid), { accountStatus, isActive: false, archivedAt, archivedBy: request.auth.uid, updatedAt: archivedAt }, { merge: true });
  batch.set(db.collection('calendarSubscriptions').doc(targetUid), { active: false, accountStatus, archivedAt, updatedAt: archivedAt }, { merge: true });
  if (ban && target.email) batch.set(db.collection('bannedUsers').doc(target.email.toLowerCase().replace(/\./g, '_')), { email: target.email.toLowerCase(), bannedAt: archivedAt, bannedBy: request.auth.uid, reason: 'Admin archive with ban', active: true, fullName: target.fullName || '', uid: targetUid, role: target.role || 'user', phone: target.phone || '', phoneVerified: target.phoneVerified || false }, { merge: true });
  await batch.commit();
  await admin.auth().updateUser(targetUid, { disabled: true }).catch(error => console.warn('Disable auth failed:', error.message));
  return { archived: true, eventsArchived: events.size, banned: ban };
});
exports.adminRestoreUser = onCall({ region: REGION }, async request => {
  const caller = await callerProfile(request);
  if (caller.role !== 'superAdmin') throw new HttpsError('permission-denied', 'Super Admin access required.');
  const targetUid = String(request.data?.targetUid || '').trim();
  const target = await db.collection('users').doc(targetUid).get();
  if (!target.exists) throw new HttpsError('not-found', 'Archived user record not found.');
  if (target.data()?.accountStatus === 'banned') throw new HttpsError('failed-precondition', 'Use Unban for a banned account.');
  const now = admin.firestore.Timestamp.now();
  const batch = db.batch();
  batch.set(target.ref, { isActive: true, accountStatus: 'active', restoredAt: now, restoredBy: request.auth.uid, updatedAt: now }, { merge: true });
  batch.set(db.collection('archivedUsers').doc(targetUid), { archiveActive: false, restoredAt: now, restoredBy: request.auth.uid }, { merge: true });
  await batch.commit();
  await admin.auth().updateUser(targetUid, { disabled: false });
  return { restored: true };
});
return exports;
};
