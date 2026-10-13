'use strict';
// Emulator-only candidate. Uses existing support records; exports no delivery trigger.
const clean = value => String(value || '').trim();
const { createHash } = require('node:crypto');
const { createLegacyAppeals } = require('./legacy-appeals.cjs');
const cities = new Set(['sydney', 'melbourne', 'canberra', 'brisbane', 'adelaide', 'hobart', 'perth', 'rest-of-australia']);
const decisions = new Set(['under-review', 'dismissed', 'closed', 'takedown', 'conversation-blocked', 'conversation-unblocked']);
const historical = business => ['archived', 'deleted'].includes(business?.status);
const date = value => value?.toDate?.().toISOString() || (value instanceof Date ? value.toISOString() : typeof value === 'string' ? value : '');
const threadVersion = thread => createHash('sha256').update(JSON.stringify([thread.adminBlocked === true,thread.adminBlockedBy || '',
  date(thread.adminBlockedAt),thread.adminBlockedReason || '',thread.adminBlockedReportId || ''])).digest('hex');

exports.register = function ({ db, admin, FieldPath, HttpsError, onCall, REGION }) {
  const error = (code, message) => { throw new HttpsError(code, message); };
  const profileRef = request => {
    if (!request.auth?.uid || request.auth.token?.firebase?.sign_in_provider === 'anonymous') error('unauthenticated', 'Sign in to continue.');
    return db.collection('users').doc(request.auth.uid);
  };
  const scope = profile => {
    if (!profile || !['admin', 'superAdmin'].includes(profile.role) || profile.isActive === false || profile.active === false
      || ['archived', 'deleted', 'banned'].includes(profile.accountStatus)) error('permission-denied', 'Active administrator access is required.');
    const city = clean(profile.adminCity || profile.defaultCity).toLowerCase();
    if (profile.role !== 'superAdmin' && !cities.has(city)) error('permission-denied', 'An assigned administration city is required.');
    return { role: profile.role, city };
  };
  const canRead = (who, report, business) => who.role === 'superAdmin' || (report.kind === 'business-report'
    && report.city === who.city && business?.location?.city === who.city);
  const available = (business, thread) => ['under-review', 'dismissed', ...(business && !historical(business) ? ['takedown'] : []),
    ...(thread ? [thread.adminBlocked === true ? 'conversation-unblocked' : 'conversation-blocked'] : []), 'closed'];
  const validId = id => typeof id === 'string' && id.length > 0 && id.length <= 1500 && id === id.trim() && !id.includes('/') && !['.','..'].includes(id);
  const linkedThreadRef = report => report.reportSource === 'verified-conversation' && validId(report.reportedThreadId)
    ? db.collection('businessMessageThreads').doc(report.reportedThreadId) : null;
  const linkedThread = (report, snapshot) => {
    const thread = snapshot?.data();
    return thread?.type === 'business' && thread.businessId === report.businessId
      && thread.participantUids?.length === 2 && thread.participantUids.includes(report.senderUid) ? thread : null;
  };
  const validReference = id => typeof id === 'string' && /^[a-f0-9]{64}$/.test(id);
  // Include appeals against earlier notices, even after a later decision exists.
  const pendingAppeals = id => db.collection('businessModerationNotices').where('reportId', '==', id)
    .where('appealStatus', '==', 'submitted').orderBy(FieldPath.documentId()).limit(1);
  const resultRow = async (item, who) => {
    const report = item.data();
    if (!['app-feedback', 'business-report'].includes(report.kind)) return null;
    const businessRef = report.kind === 'business-report' && report.businessId && !report.businessId.includes('/')
      ? db.collection('businesses').doc(report.businessId) : null;
    const business = businessRef ? (await businessRef.get()).data() : null;
    if (!canRead(who, report, business)) return null;
    const threadRef = linkedThreadRef(report);
    const [outbox, stored, threadDoc] = await Promise.all([
      db.collection('supportEmailOutbox').doc(item.id).get(), db.collection('businessModerationCases').doc(item.id).get(),
      threadRef ? threadRef.get() : null,
    ]);
    const thread = linkedThread(report, threadDoc);
    const record = stored.data() || {};
    const pendingNotice = (await pendingAppeals(item.id).get()).docs[0];
    const notice = pendingNotice?.data(), appeal = Boolean(pendingNotice);
    const deliveryStatus = clean(outbox.data()?.status) || ({ 'email-sent': 'sent', 'email-failed': 'failed' }[report.status]) || (report.reportSource === 'verified-conversation' ? 'not-requested' : 'unknown');
    return {
      delivery: { reference: item.id, kind: report.kind, category: clean(report.category), city: report.kind === 'business-report' ? clean(report.city) : '',
        businessId: clean(report.businessId), businessName: clean(report.businessName), senderName: clean(report.senderName),
        senderEmail: clean(report.senderEmail), message: clean(report.message), date: date(report.submittedAt || report.createdAt), deliveryStatus,
        ...(report.kind === 'business-report' ? { moderationId: item.id } : {}) },
      moderation: report.kind !== 'business-report' ? null : { id: item.id, category: appeal ? 'business-appeal' : thread ? 'business-conversation-report' : 'business-report',
        subject: appeal ? 'Owner appeal' : clean(report.category), businessId: report.businessId, businessName: clean(report.businessName),
        city: report.city, message: appeal ? clean(notice.appealText) : clean(report.message),
        reporterName: appeal ? 'Business owner' : clean(report.senderName), reporterEmail: appeal ? '' : clean(report.senderEmail),
        originalDecision: appeal ? clean(notice.decision) : '', expectedAppealId: appeal ? pendingNotice.id : '',
        moderationStatus: appeal ? 'submitted' : record.status || 'submitted', version: record.version || 0,
        ...(thread ? {reportedThreadId:report.reportedThreadId,expectedThreadVersion:threadVersion(thread)} : {}),
        date: date(appeal ? notice.appealedAt : report.submittedAt || report.createdAt), availableDecisions: available(business,thread),
        history: Array.isArray(record.recentHistory) ? record.recentHistory : [], historyCount: record.version || 0 },
    };
  };
  const legacyAppeals = createLegacyAppeals({ db, admin, FieldPath, error, profileRef, scope });
  const listDirectoryOperations = onCall({ region: REGION }, async request => {
    if (request.data?.view === 'appeals' || request.data?.id?.startsWith('appeal:')) return legacyAppeals.list(request);
    const caller = profileRef(request), who = scope((await caller.get()).data());
    const { cursor = '', view = 'deliveries', pageSize = 20, id = '' } = request.data || {};
    if (!['deliveries', 'moderation'].includes(view) || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 25
      || cursor && !validReference(cursor) || id && !validReference(id)) error('invalid-argument', 'Invalid operations page.');
    let query = db.collection('supportSubmissions');
    query = who.role !== 'superAdmin' || view === 'moderation' ? query.where('kind', '==', 'business-report')
      : query.where('kind', 'in', ['app-feedback', 'business-report']);
    if (who.role !== 'superAdmin') query = query.where('city', '==', who.city);
    if (id) query = query.where(FieldPath.documentId(), '==', id);
    query = query.orderBy(FieldPath.documentId());
    if (cursor) query = query.startAfter(cursor);
    const snapshot = await query.limit(pageSize + 1).get();
    const page = snapshot.docs.slice(0, pageSize);
    const mapped = (await Promise.all(page.map(item => resultRow(item, who)))).filter(Boolean);
    // Do not return private results if staff permissions changed during the read.
    const current = scope((await caller.get()).data());
    if (current.role !== who.role || current.city !== who.city) error('permission-denied', 'Your administration scope changed. Refresh this screen.');
    return { supportRequests: mapped.map(item => item.delivery), moderationCases: mapped.map(item => item.moderation).filter(Boolean),
      nextCursor: snapshot.size > pageSize ? page.at(-1).id : null };
  });

  const submitDirectoryConversationReport = onCall({region:REGION}, async request => {
    const caller = profileRef(request), uid = request.auth.uid;
    const {threadId,requestId} = request.data || {}, reason = clean(request.data?.reason);
    if (!validId(threadId) || !/^[a-zA-Z0-9_-]{12,100}$/.test(requestId || '') || reason.length < 10 || reason.length > 2500) {
      error('invalid-argument','Choose a conversation, a stable request reference and 10–2500 characters of detail.');
    }
    const reference = createHash('sha256').update('conversation:' + uid + ':' + requestId).digest('hex');
    return db.runTransaction(async tx => {
      const profile = (await tx.get(caller)).data();
      if (!profile || profile.isActive === false || profile.active === false || ['archived','banned','deleted'].includes(profile.accountStatus)) error('permission-denied','An active member account is required.');
      const thread = (await tx.get(db.collection('businessMessageThreads').doc(threadId))).data();
      if (!thread || thread.type !== 'business' || thread.participantUids?.length !== 2 || !thread.participantUids.includes(uid) || !validId(thread.businessId)) error('permission-denied','This conversation is not available to your account.');
      const reportRef = db.collection('supportSubmissions').doc(reference);
      const previous = (await tx.get(reportRef)).data();
      if (previous) {
        if (previous.senderUid !== uid || previous.reportedThreadId !== threadId || previous.message !== reason) error('already-exists','This reference was already used for a different report.');
        return {reference,status:previous.status};
      }
      const business = (await tx.get(db.collection('businesses').doc(thread.businessId))).data();
      if (!business || !cities.has(business.location?.city)) error('failed-precondition','This business needs its directory location reviewed before reporting.');
      const limitRef = db.collection('supportSubmissionLimits').doc(uid), rate = (await tx.get(limitRef)).data();
      if (Number(rate?.lastAt || 0) > Date.now() - 30000) error('resource-exhausted','Please wait 30 seconds before submitting another report.');
      const now = admin.firestore.Timestamp.now();
      tx.create(reportRef,{kind:'business-report',category:'Conversation concern',reportSource:'verified-conversation',
        reportedThreadId:threadId,senderUid:uid,senderName:clean(profile.fullName) || 'Community member',senderEmail:clean(profile.email),
        businessId:thread.businessId,businessName:clean(business.name),city:business.location.city,message:reason,
        status:'recorded',submittedAt:now.toDate().toISOString(),createdAt:now});
      tx.set(limitRef,{lastAt:Date.now()});
      return {reference,status:'recorded'};
    });
  });

  const decideDirectoryReport = onCall({ region: REGION }, async request => {
    if (request.data?.id?.startsWith('appeal:')) return legacyAppeals.decide(request);
    const caller = profileRef(request);
    const { id, decision, version, expectedAppealId = '' } = request.data || {}, reason = clean(request.data?.reason);
    if (!validReference(id) || !decisions.has(decision) || !Number.isInteger(version) || version < 0 || reason.length < 10 || reason.length > 2500
      || typeof expectedAppealId !== 'string' || expectedAppealId.includes('/')) error('invalid-argument', 'Choose a current report and a decision reason of 10–2500 characters.');
    return db.runTransaction(async tx => {
      const who = scope((await tx.get(caller)).data());
      const reportRef = db.collection('supportSubmissions').doc(id), caseRef = db.collection('businessModerationCases').doc(id);
      const reportDoc = await tx.get(reportRef), caseDoc = await tx.get(caseRef);
      const report = reportDoc.data(), existing = caseDoc.data() || {};
      if (!report || report.kind !== 'business-report' || !report.businessId || report.businessId.includes('/')) error('not-found', 'Business report unavailable.');
      const businessRef = db.collection('businesses').doc(report.businessId), business = (await tx.get(businessRef)).data();
      if (!canRead(who, report, business)) error('permission-denied', 'This report is outside your administration city.');
      if ((existing.version || 0) !== version) error('failed-precondition', 'Another decision was recorded. Refresh before deciding again.');
      const pendingNotice = (await tx.get(pendingAppeals(id))).docs[0];
      const previousNoticeRef = pendingNotice?.ref, previousNotice = pendingNotice?.data();
      const appealId = pendingNotice?.id || '';
      if (appealId !== expectedAppealId) error('failed-precondition', 'The appeal state changed. Refresh before deciding.');
      if (!appealId && existing.status === decision) error('failed-precondition', 'This decision is already recorded.');
      const threadRef = linkedThreadRef(report), threadDoc = threadRef ? await tx.get(threadRef) : null;
      const thread = linkedThread(report,threadDoc);
      if (!available(business,thread).includes(decision)) error('failed-precondition', 'This decision is unavailable for the current listing or verified conversation.');
      if (decision.startsWith('conversation-') && request.data.expectedThreadVersion !== threadVersion(thread)) error('failed-precondition','Conversation moderation changed. Refresh before deciding.');
      const promotions = decision === 'takedown'
        ? await tx.get(db.collection('businessPromotions').where('businessId', '==', report.businessId).limit(201)) : null;
      if (promotions?.size > 200) error('failed-precondition', 'This business needs a larger administrative archive operation. No changes were made.');
      const now = admin.firestore.Timestamp.now(), nextVersion = version + 1;
      const decisionId = `${id}_${String(nextVersion).padStart(8, '0')}`;
      const history = { decision, reason, actorLabel: who.role === 'superAdmin' ? 'Super administrator' : 'City administrator', date: now.toDate().toISOString() };
      // All reads precede writes; the public withdrawal and retained history are atomic.
      if (decision === 'conversation-blocked' || decision === 'conversation-unblocked') {
        tx.update(threadRef,{adminBlocked:decision === 'conversation-blocked',adminBlockedReason:reason,
          adminBlockedBy:request.auth.uid,adminBlockedAt:now,adminBlockedReportId:id,updatedAt:now});
      }
      if (decision === 'takedown') {
        tx.update(businessRef, { previousStatus: business.status || 'pending', status: 'archived', lifecycleState: 'archived', hidden: true,
          archivedAt: now, archivedBy: request.auth.uid, archiveReason: reason, updatedAt: now });
        tx.delete(db.collection('publicBusinesses').doc(report.businessId));
        tx.delete(db.collection('businessContactRoutes').doc(report.businessId));
        promotions.docs.forEach(item => {
          if (!historical(item.data())) tx.update(item.ref, { previousStatus: item.data().status || 'pending', status: 'archived', hidden: true,
            archivedAt: now, archivedBy: request.auth.uid, archiveReason: reason, updatedAt: now });
          tx.delete(db.collection('publicBusinessPromotions').doc(item.id));
        });
      }
      const noticeId = business?.ownerId ? decisionId : '';
      tx.set(caseRef, { businessId: report.businessId, city: report.city, status: decision, version: nextVersion,
        recentHistory: [...(existing.recentHistory || []), history].slice(-10), lastNoticeId: noticeId, updatedAt: now }, { merge: true });
      tx.create(db.collection('businessModerationAudit').doc(decisionId), { reportId: id, businessId: report.businessId,
        action: 'business.report_decided', decision, reason, actorUid: request.auth.uid, actorRole: who.role, version: nextVersion,
        ...(thread ? {reportedThreadId:report.reportedThreadId} : {}),
        ...(appealId ? { appealNoticeId: appealId, appealText: clean(previousNotice.appealText) } : {}), createdAt: now });
      if (noticeId) tx.create(db.collection('businessModerationNotices').doc(noticeId), {
        ownerUid: business.ownerId, businessId: report.businessId, businessName: clean(business.name || report.businessName),
        reportId: id, decision, reason, appealStatus: 'not-submitted', createdAt: now,
      });
      if (appealId) tx.update(previousNoticeRef, { appealStatus: 'reviewed', appealDecision: decision, appealReviewedAt: now, appealReviewedBy: request.auth.uid });
      return { id, version: nextVersion, decision };
    });
  });
  return { listDirectoryOperations, decideDirectoryReport, submitDirectoryConversationReport };
};
