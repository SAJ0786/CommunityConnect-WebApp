'use strict';
// Isolated candidate for notices created by the native feedback workflow.
const { createHash } = require('node:crypto');
const clean = value => String(value || '').trim();
const date = value => value?.toDate?.().toISOString() || (value instanceof Date ? value.toISOString() : typeof value === 'string' ? value : '');
const validId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(value);
const prefix = 'appeal:';
const caseId = id => 'legacy-appeal-' + id;
const version = notice => createHash('sha256').update(JSON.stringify([
  notice.businessId, notice.ownerUid, notice.reportId || '', notice.decision, notice.reason,
  notice.appealStatus, notice.appealText, notice.appealedBy, date(notice.appealedAt),
  notice.appealDecision || '', notice.appealReason || '',
])).digest('hex');

exports.createLegacyAppeals = ({ db, admin, FieldPath, error, profileRef, scope }) => {
  const authorised = (who, notice, business) => business && notice.ownerUid === business.ownerId
    && (who.role === 'superAdmin' || business.location?.city === who.city);
  async function readContext(notice, get) {
    if (!validId(notice.businessId)) return {};
    const business = (await get(db.collection('businesses').doc(notice.businessId))).data();
    const linked = validId(notice.reportId) ? (await get(db.collection('supportSubmissions').doc(notice.reportId))).data() : null;
    return { business, linked };
  }
  const result = (id, notice, business, record = {}) => ({
    id: prefix + id, category: 'business-appeal', subject: 'Owner appeal',
    businessId: notice.businessId, businessName: clean(business.name || notice.businessName),
    city: business.location?.city || '', message: clean(notice.appealText),
    reporterName: 'Business owner', reporterEmail: '', originalDecision: clean(notice.decision),
    originalReason: clean(notice.reason), expectedAppealId: id, expectedAppealVersion: version(notice),
    moderationStatus: notice.appealStatus === 'submitted' ? (record.status === 'under-review' ? 'under-review' : 'submitted') : record.status || notice.appealDecision || 'closed',
    version: record.version || 0, date: date(notice.appealedAt),
    availableDecisions: ['under-review', 'dismissed', 'closed'],
    history: Array.isArray(record.recentHistory) ? record.recentHistory : [], historyCount: record.version || 0,
  });
  async function list(request) {
    const caller = profileRef(request), who = scope((await caller.get()).data());
    const { cursor = '', pageSize = 20, id = '' } = request.data || {};
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 25
      || cursor && !validId(cursor) || id && (!id.startsWith(prefix) || !validId(id.slice(prefix.length)))) error('invalid-argument', 'Invalid appeal page.');
    let query = db.collection('businessModerationNotices').where('appealStatus', 'in', ['submitted', 'reviewed']);
    if (id) query = query.where(FieldPath.documentId(), '==', id.slice(prefix.length));
    query = query.orderBy(FieldPath.documentId());
    if (cursor) query = query.startAfter(cursor);
    const snapshot = await query.limit(pageSize + 1).get(), page = snapshot.docs.slice(0, pageSize);
    const mapped = await Promise.all(page.map(async item => {
      const notice = item.data(), { business, linked } = await readContext(notice, ref => ref.get());
      // Support-backed notices already appear in the report queue. Never duplicate them.
      if (linked || !authorised(who, notice, business)) return null;
      const record = (await db.collection('businessModerationCases').doc(caseId(item.id)).get()).data();
      return result(item.id, notice, business, record);
    }));
    const current = scope((await caller.get()).data());
    if (current.role !== who.role || current.city !== who.city) error('permission-denied', 'Your administration scope changed. Refresh this screen.');
    return { supportRequests: [], moderationCases: mapped.filter(Boolean), nextCursor: snapshot.size > pageSize ? page.at(-1).id : null };
  }
  async function decide(request) {
    const caller = profileRef(request), data = request.data || {}, id = data.id?.slice(prefix.length), reason = clean(data.reason);
    if (!validId(id) || !['under-review','dismissed','closed'].includes(data.decision)
      || !Number.isInteger(data.version) || data.version < 0 || reason.length < 10 || reason.length > 2500
      || data.expectedAppealId !== id) error('invalid-argument', 'Choose a current appeal and a clear decision reason.');
    return db.runTransaction(async tx => {
      const who = scope((await tx.get(caller)).data());
      const noticeRef = db.collection('businessModerationNotices').doc(id), notice = (await tx.get(noticeRef)).data();
      if (!notice) error('not-found', 'Appeal unavailable.');
      const { business, linked } = await readContext(notice, ref => tx.get(ref));
      if (!authorised(who, notice, business)) error('permission-denied', 'This appeal is outside your current administration scope.');
      const recordRef = db.collection('businessModerationCases').doc(caseId(id)), record = (await tx.get(recordRef)).data() || {};
      if (linked || notice.appealStatus !== 'submitted' || data.expectedAppealVersion !== version(notice)
        || data.version !== (record.version || 0)) error('failed-precondition', 'This appeal changed. Refresh before deciding.');
      const now = admin.firestore.Timestamp.now(), nextVersion = data.version + 1;
      const history = { decision: data.decision, reason, actorLabel: who.role === 'superAdmin' ? 'Super administrator' : 'City administrator', date: now.toDate().toISOString() };
      tx.update(noticeRef, { appealStatus: data.decision === 'under-review' ? 'submitted' : 'reviewed',
        appealDecision: data.decision, appealReason: reason, appealReviewedAt: now, appealReviewedBy: request.auth.uid });
      tx.set(recordRef, { businessId: notice.businessId, city: business.location?.city || '', status: data.decision,
        version: nextVersion, recentHistory: [...(record.recentHistory || []), history].slice(-10), updatedAt: now }, { merge: true });
      tx.create(db.collection('businessModerationAudit').doc(caseId(id) + '_' + String(nextVersion).padStart(8,'0')), {
        action: 'business.legacy_appeal_decided', reportId: clean(notice.reportId), appealNoticeId: id,
        businessId: notice.businessId, decision: data.decision, reason, appealText: clean(notice.appealText),
        actorUid: request.auth.uid, actorRole: who.role, version: nextVersion, createdAt: now,
      });
      return { id: data.id, version: nextVersion, decision: data.decision };
    });
  }
  return { list, decide };
};
