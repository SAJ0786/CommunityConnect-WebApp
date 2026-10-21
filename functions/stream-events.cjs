'use strict';

function streamEventCollection(value = 'events') {
  if (!['events', 'registrationEvents'].includes(value)) throw new Error('Unsupported event collection.');
  return value;
}

function streamEventData(event, collection) {
  if (collection === 'events') return event;
  return {
    createdByUserId: event.ownerUid,
    metroArea: event.city,
    prayerTimeZone: event.timeZone,
    eventSubject: event.title || '',
    eventType: event.customEventType || event.eventType || '',
    eventDate: event.date || '',
    startTime: event.startTime || '',
    endTime: event.endTime || '',
    address: { suburb: event.suburb || '' },
    isLive: event.isLive === true,
    liveUrl: event.liveUrl || null,
    liveWatchUrl: event.liveAppVisibility === 'public' ? event.liveWatchUrl || null : null,
    liveSource: event.liveSource || null,
    liveAppVisibility: event.liveAppVisibility || null,
    liveStartedAt: event.liveStartedAt || null,
    liveVideoRecordId: event.liveVideoRecordId || null,
  };
}

function assertStreamSession(session, eventId, collection, HttpsError) {
  if (session.eventId !== eventId || streamEventCollection(session.eventCollection) !== collection) {
    throw new HttpsError('failed-precondition', 'This session does not belong to the selected event.');
  }
}

function createStreamEventResolver({ db, HttpsError, adminCanAccessEvent }) {
  return async function resolve(request, { allowInactive = false } = {}) {
    if (!request.auth || request.auth.token?.firebase?.sign_in_provider === 'anonymous') {
      throw new HttpsError('unauthenticated', 'Login required.');
    }
    const { eventId, eventCollection } = request.data || {};
    if (typeof eventId !== 'string' || !eventId || eventId.includes('/')) {
      throw new HttpsError('invalid-argument', 'A valid eventId is required.');
    }
    let collection;
    try { collection = streamEventCollection(eventCollection); }
    catch (error) { throw new HttpsError('invalid-argument', error.message); }
    const ref = db.collection(collection).doc(eventId);
    const snapshot = await ref.get();
    if (!snapshot.exists) throw new HttpsError('not-found', 'Event not found.');
    const event = snapshot.data();
    const data = streamEventData(event, collection);
    if (collection === 'registrationEvents') {
      if (event.hidden && event.ownerUid !== request.auth.uid) throw new HttpsError('permission-denied', 'The organiser has chosen to hide this event. It is currently unavailable.');
      const profile = (await db.collection('users').doc(request.auth.uid).get()).data();
      if (!profile || profile.isActive === false || profile.bannedAt || profile.archivedAt || profile.accountDeletedAt
        || ['inactive', 'banned', 'deleted', 'archived', 'suspended'].includes(profile.accountStatus)) {
        throw new HttpsError('permission-denied', 'An active account is required.');
      }
      const canManage = event.ownerUid === request.auth.uid || profile.role === 'superAdmin'
        || profile.role === 'admin' && Boolean(event.city) && (profile.adminCity || profile.defaultCity) === event.city;
      if (!canManage) throw new HttpsError('permission-denied', 'Not authorised to stream this event.');
      if (!allowInactive && (event.status !== 'approved' || event.deletedAt || event.hidden)) {
        throw new HttpsError('failed-precondition', 'Only approved, available registration events can stream.');
      }
    } else if (event.createdByUserId !== request.auth.uid) {
      const profile = (await db.collection('users').doc(request.auth.uid).get()).data() || {};
      if (!adminCanAccessEvent(profile, event)) throw new HttpsError('permission-denied', 'Not authorised to stream this event.');
    }
    return { ref, data, collection };
  };
}

function createStreamEventPublisher({ db, HttpsError }) {
  return async (ref, collection, fields) => {
    if (collection === 'events') return ref.update(fields);
    return db.runTransaction(async transaction => {
      const snapshot = await transaction.get(ref);
      const event = snapshot.data();
      if (!snapshot.exists || event.status !== 'approved' || event.deletedAt || event.hidden || event.isLive) {
        throw new HttpsError('failed-precondition', 'This registration event is unavailable or already streaming. Refresh before retrying.');
      }
      transaction.update(ref, fields);
    });
  };
}

module.exports = { streamEventCollection, streamEventData, assertStreamSession, createStreamEventResolver, createStreamEventPublisher };
