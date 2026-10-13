'use strict';
// Unchanged native handler body, wrapped for isolated dependency injection.
exports.register = function ({ admin, db, onCall, HttpsError, REGION }) {
const clean = value => String(value || '').trim();
return onCall(
  { region: REGION, enforceAppCheck: false },
  async request => {
    if (!request.auth || request.auth.token?.firebase?.sign_in_provider === 'anonymous') {
      throw new HttpsError('unauthenticated', 'Sign in is required to contact a business.');
    }
    const businessId = clean(request.data?.businessId);
    const text = clean(request.data?.text);
    const senderName = clean(request.data?.senderName) || 'Community member';
    if (!businessId || businessId.length > 160) throw new HttpsError('invalid-argument', 'Business reference is invalid.');
    if (!text || text.length > 2000) throw new HttpsError('invalid-argument', 'Enter a message of up to 2000 characters.');

    const [businessSnapshot, publicSnapshot, routeSnapshot] = await Promise.all([
      db.collection('businesses').doc(businessId).get(),
      db.collection('publicBusinesses').doc(businessId).get(),
      db.collection('businessContactRoutes').doc(businessId).get(),
    ]);
    if (!businessSnapshot.exists || !publicSnapshot.exists) throw new HttpsError('not-found', 'This public business could not be found.');
    const business = businessSnapshot.data() || {};
    // The route is the published contact target and may be newer than the
    // private business record after an ownership transfer.
    const route = routeSnapshot.data() || {};
    let ownerUid = clean(route.active === true ? route.ownerUid : '') || clean(business.ownerId);
    if (!ownerUid || business.hidden === true || (business.status !== 'approved' && business.hasPublishedVersion !== true)) {
      throw new HttpsError('failed-precondition', 'This business does not have an active in-app contact inbox.');
    }
    if (ownerUid === request.auth.uid) throw new HttpsError('failed-precondition', 'This business listing is already managed by you.');

    const senderUid = request.auth.uid;
    const threadId = `${businessId}_${senderUid}_${ownerUid}`;
    const threadReference = db.collection('businessMessageThreads').doc(threadId);
    const messageReference = threadReference.collection('messages').doc();
    const isNew = await db.runTransaction(async transaction => {
      const threadSnapshot = await transaction.get(threadReference);
      const existingThread = threadSnapshot.data() || {};
      if (existingThread.adminBlocked === true || Object.values(existingThread.blockedBy || {}).some(Boolean)) {
        throw new HttpsError('failed-precondition', 'This conversation is blocked.');
      }
      transaction.set(threadReference, {
        type: 'business',
        businessId,
        businessName: clean(publicSnapshot.data()?.name || business.name) || 'Community Business',
        ownerUid,
        senderUid,
        senderName,
        participantUids: [senderUid, ownerUid],
        ...(threadSnapshot.exists ? {} : { createdAt: admin.firestore.FieldValue.serverTimestamp() }),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastMessage: text,
        lastSenderUid: senderUid,
        unreadBy: {
          [ownerUid]: admin.firestore.FieldValue.increment(1),
          [senderUid]: 0,
        },
      }, { merge: true });
      transaction.set(messageReference, {
        senderUid,
        senderName,
        text,
        kind: 'text',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      transaction.set(db.collection('businessContactRoutes').doc(businessId), {
        businessId,
        ownerUid,
        active: true,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      return !threadSnapshot.exists;
    });
    return { threadId, isNew };
  }
);
};
