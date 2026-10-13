'use strict';
// Native handler snapshot; isolated dependencies and candidate guards are supplied by index.cjs.
const { isFutureSeriesEvent } = require('./seriesScope.cjs');
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
exports.archiveEventRecords = onCall({ region: REGION }, async request => {
  const eventId = String(request.data?.eventId || '').trim();
  const seriesId = String(request.data?.seriesId || '').trim();
  if (!eventId && !seriesId) throw new HttpsError('invalid-argument', 'An event or series reference is required.');
  const caller = await callerProfile(request);
  let eventDocs = eventId
    ? [await db.collection('events').doc(eventId).get()]
    : (await db.collection('events').where('seriesId', '==', seriesId).get()).docs;
  if (seriesId && !eventDocs.length) {
    eventDocs = (await db.collection('events').where('recurringSeriesId', '==', seriesId).get()).docs;
  }
  eventDocs = eventDocs.filter(item => item.exists);
  if (!eventDocs.length) throw new HttpsError('not-found', 'No matching active event was found.');
  for (const eventDoc of eventDocs) {
    const data = eventDoc.data() || {};
    const owner = data.createdByUserId === request.auth.uid || data.ownerUid === request.auth.uid;
    if (!owner && !adminCanAccessEvent(caller, data)) throw new HttpsError('permission-denied', 'You cannot archive one or more selected events.');
    if (data.isLive === true) throw new HttpsError('failed-precondition', 'End the live stream before archiving this event.');
  }
  const archivedAt = admin.firestore.Timestamp.now();
  for (let offset = 0; offset < eventDocs.length; offset += 240) {
    const batch = db.batch();
    eventDocs.slice(offset, offset + 240).forEach(eventDoc => {
      batch.set(db.collection('archivedEvents').doc(eventDoc.id), {
        ...eventDoc.data(), status: 'inactive', archivedAt, archivedBy: request.auth.uid,
        archivedFromEventId: eventDoc.id,
        archiveReason: seriesId ? 'series_archived_by_user_or_admin' : 'event_archived_by_user_or_admin',
      }, { merge: true });
      batch.delete(eventDoc.ref);
    });
    await batch.commit();
  }
  if (seriesId) await db.collection('recurringEventSeries').doc(seriesId).set({ status: 'archived', archivedAt, archivedBy: request.auth.uid, updatedAt: archivedAt }, { merge: true });
  return { archived: eventDocs.length };
});

// Separate endpoint prevents a new client calling the old all-series handler.
exports.archiveFutureSeriesEvents = onCall({ region: REGION }, async request => {
  if (!request.auth || request.auth.token?.firebase?.sign_in_provider === 'anonymous') throw new HttpsError('unauthenticated', 'Login required.');
  const seriesId = String(request.data?.seriesId || '').trim();
  const expectedIds = request.data?.expectedIds;
  if (!seriesId || !Array.isArray(expectedIds) || !expectedIds.length || expectedIds.length > 500
    || expectedIds.some(id => typeof id !== 'string') || new Set(expectedIds).size !== expectedIds.length) {
    throw new HttpsError('invalid-argument', 'Select a series with future events first.');
  }
  const caller = await callerProfile(request);
  const snapshots = await Promise.all(['seriesId', 'recurringSeriesId'].map(field =>
    db.collection('events').where(field, '==', seriesId).get()));
  const docs = [...new Map(snapshots.flatMap(snapshot => snapshot.docs).map(item => [item.id, item])).values()];
  const now = new Date();
  const future = docs.filter(item => isFutureSeriesEvent(item.data(), now));
  if (!future.length) throw new HttpsError('failed-precondition', 'No future events remain in this series.');
  if (future.length !== expectedIds.length || future.some(item => !expectedIds.includes(item.id))) {
    throw new HttpsError('failed-precondition', 'The remaining events have changed. Reopen Delete Series and confirm the new count.');
  }
  const authorize = data => {
    const owner = data.createdByUserId === request.auth.uid || data.ownerUid === request.auth.uid;
    if (!owner && !adminCanAccessEvent(caller, data)) throw new HttpsError('permission-denied', 'You cannot archive one or more selected events.');
  };
  future.forEach(item => authorize(item.data()));
  const archivedIds = [];
  for (let offset = 0; offset < future.length; offset += 240) {
    const chunk = future.slice(offset, offset + 240);
    const ids = await db.runTransaction(async transaction => {
      const current = await transaction.getAll(...chunk.map(item => item.ref));
      const checkedAt = new Date();
      const eligible = current.filter(item => item.exists && isFutureSeriesEvent(item.data(), checkedAt));
      eligible.forEach(item => {
        const data = item.data();
        if (data.seriesId !== seriesId && data.recurringSeriesId !== seriesId) throw new HttpsError('failed-precondition', 'Series membership changed. Refresh and try again.');
        authorize(data);
      });
      const archivedAt = admin.firestore.Timestamp.now();
      eligible.forEach(item => {
        transaction.set(db.collection('archivedEvents').doc(item.id), {
          ...item.data(), status: 'inactive', archivedAt, archivedBy: request.auth.uid,
          archivedFromEventId: item.id, archiveReason: 'future_series_archived_by_user_or_admin',
        }, { merge: true });
        transaction.delete(item.ref);
      });
      return eligible.map(item => item.id);
    });
    archivedIds.push(...ids);
  }
  // Historical or live occurrences may remain; do not archive the whole series.
  await db.collection('recurringEventSeries').doc(seriesId).set({
    lastFutureDeletionAt: admin.firestore.Timestamp.now(), lastFutureDeletionBy: request.auth.uid,
    lastFutureDeletionCount: archivedIds.length, updatedAt: admin.firestore.Timestamp.now(),
  }, { merge: true });
  return { archived: archivedIds.length, archivedIds };
});
return exports;
};
