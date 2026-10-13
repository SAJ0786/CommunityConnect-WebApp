import { createBusinessService } from './businesses.mjs';
import { requireDirectoryMember, requireDirectoryAdmin, requireBusinessParticipant, replyText } from './policy.mjs';
import { toPublicBusiness } from '../../utils/publicBusinesses.mjs';
import { toPublicPromotion } from '../../utils/publicPromotions.mjs';
import { timestampMillis } from '../../utils/businessDiscovery.mjs';
import { BUSINESS_CATEGORIES } from '../../business/categories.mjs';
import { mergeDirectoryCategories, addDirectoryCategory } from './categories.mjs';
import { supportPayload } from '../../business/operationsModel.mjs';
import { inspectBusinessImage } from './images.mjs';

const idValue = value => {
  if (typeof value !== 'string' || !value || value.includes('/')) throw new Error('A valid record reference is required.');
  return value;
};
const dateLabel = value => timestampMillis(value) ? new Date(timestampMillis(value)).toLocaleString('en-AU') : '';
const rows = snapshot => snapshot.docs.map(item => ({ ...item.data(), id: item.id }));
export const emptyDirectoryData = () => ({ businesses: [], promotions: [], publicBusinesses: [], publicPromotions: [],
  savedIds: [], notifications: [], threads: [], members: [], statistics: [], categories: BUSINESS_CATEGORIES,
  supportRequests: [], moderationCases: [], unavailablePages: {
    deliveries: 'Support delivery records are server-only in the existing rules. An authorised backend reader is required before this screen can show them.',
    moderation: 'The current report workflow delivers reports by email. Connecting this review queue requires a backend contract; no report history is being queried here.',
  } });

// SDK injection supports separately gated live and isolated sessions.
// No production Firebase singleton is imported into this shared gateway.
export function createDirectoryGateway({ db, user, assertOpen = () => {}, storage = globalThis.localStorage, sdk, images, operationsEnabled = false,
  callFunction = async () => { throw new Error('The isolated Functions service is not connected. No changes were sent.'); } }) {
  const { arrayRemove, arrayUnion, collection, doc, getDocFromServer, getDocsFromServer, increment,
    onSnapshot, orderBy, query, serverTimestamp, updateDoc, where, writeBatch } = sdk;
  let closed = false;
  const subscriptions = new Set();
  const open = () => { assertOpen(); if (closed) throw new Error('This workspace session has ended.'); };
  const read = async (name, id) => {
    open();
    const snapshot = await getDocFromServer(doc(db, name, idValue(id)));
    open();
    if (!snapshot.exists()) throw new Error('This record is no longer available.');
    return { ...snapshot.data(), id: snapshot.id };
  };
  const session = async () => {
    const profile = await read('users', user?.uid);
    requireDirectoryMember(user, profile);
    return { ...profile, uid: user.uid };
  };
  const invoke = async (name, payload) => {
    open();
    const result = await callFunction(name, payload);
    open();
    return result;
  };
  const guardedSdk = { ...sdk,
    addDoc: (...args) => { open(); return sdk.addDoc(...args); },
    writeBatch: (...args) => {
      const batch = sdk.writeBatch(...args);
      const guarded = { commit: () => { open(); return batch.commit(); } };
      for (const method of ['set', 'update', 'delete']) guarded[method] = (...values) => { batch[method](...values); return guarded; };
      return guarded;
    },
  };
  const businessService = createBusinessService({ db, functions: null, sdk: guardedSdk,
    httpsCallable: (_, name) => async payload => ({ data: await invoke(name, payload) }),
    ensureFirebaseSession: async () => { await session(); return user; } });
  const dismissedKey = `community-connect/emulator/${user.uid}/dismissed-notifications`;
  let dismissed;
  try { const value = JSON.parse(storage?.getItem(dismissedKey) || '[]'); dismissed = new Set(Array.isArray(value) ? value : []); }
  catch { dismissed = new Set(); }
  let emitNotifications = () => {};

  function listen(target, onValue, onError) {
    open();
    let active = true;
    const unsubscribe = onSnapshot(target, { includeMetadataChanges: true }, snapshot => {
      if (active && !closed) { try { onValue(snapshot); } catch (error) { onError(error); } }
    }, error => { if (active && !closed) onError(error); });
    const stop = () => { active = false; unsubscribe(); subscriptions.delete(stop); };
    subscriptions.add(stop);
    return stop;
  }

  let refresh = () => {};
  function subscribe(onState) {
    let active = true, stops = [], data = emptyDirectoryData(), profile = null;
    const ready = new Set(), cached = new Set();
    let expected = 0;
    const emit = (status, error = '') => {
      if (active && !closed) onState({ data: { ...data }, profile, status, error });
    };
    refresh = () => emit(ready.size < expected ? 'loading' : cached.size ? 'cached' : 'ready');
    const fail = error => {
      if (!active) return;
      stops.splice(0).forEach(stop => stop());
      data = emptyDirectoryData(); profile = null;
      emit('error', error.message || 'Could not load this workspace.');
      active = false;
    };
    emit('loading');
    const feed = (key, target, map = rows) => {
      stops.push(listen(target, snapshot => {
        data[key] = map(snapshot);
        ready.add(key);
        if (snapshot.metadata.fromCache) cached.add(key); else cached.delete(key);
        emit(ready.size < expected ? 'loading' : cached.size ? 'cached' : 'ready');
      }, fail));
    };
    session().then(member => {
      if (!active || closed) return;
      profile = member;
      const admin = ['admin', 'superAdmin'].includes(member.role);
      expected = admin ? 11 : 9;
      feed('categories', doc(db, 'settings', 'businessCategories'), snapshot => mergeDirectoryCategories(snapshot.exists() ? snapshot.data() : {}));
      const own = name => query(collection(db, name), where('ownerId', '==', user.uid));
      // City administrators fetch only their city; super administrators fetch all.
      const businessQuery = member.role === 'superAdmin' ? collection(db, 'businesses')
        : admin ? query(collection(db, 'businesses'), where('location.city', '==', member.adminCity || member.defaultCity)) : own('businesses');
      feed('businesses', businessQuery);
      // Promotions have no city field. Own promotions are loaded for members;
      // admins filter against the scoped businesses before rendering/actioning.
      feed('promotions', admin ? collection(db, 'businessPromotions') : own('businessPromotions'));
      feed('publicBusinesses', collection(db, 'publicBusinesses'), snapshot => rows(snapshot).map(row => toPublicBusiness(row.id, row)).filter(Boolean));
      feed('publicPromotions', collection(db, 'publicBusinessPromotions'), snapshot => rows(snapshot).map(row => toPublicPromotion(row.id, row)).filter(Boolean));
      feed('savedIds', doc(db, 'users', user.uid), snapshot => {
        if (!snapshot.exists()) throw new Error('Member profile is unavailable.');
        const current = snapshot.data();
        requireDirectoryMember(user, current);
        if (current.role !== member.role || current.adminCity !== member.adminCity || current.defaultCity !== member.defaultCity) {
          queueMicrotask(() => fail(new Error('Your account permissions changed. Reload the workspace.')));
          return [];
        }
        profile = { ...current, uid: user.uid };
        return Array.isArray(current.savedBusinesses) ? current.savedBusinesses : [];
      });
      let regular = [], moderation = [];
      emitNotifications = () => {
        data.notifications = [...regular.filter(row => !dismissed.has(row.id)), ...moderation]
          .sort((a, b) => timestampMillis(b.createdAt) - timestampMillis(a.createdAt));
      };
      const notificationMap = (key, snapshot) => {
        const list = rows(snapshot).map(row => ({ ...row, date: dateLabel(row.createdAt),
          ...(key === 'moderation' ? { moderation: true, read: true, title: row.businessName || 'Moderation decision', body: row.reason } : {}),
        }));
        if (key === 'regular') regular = list; else moderation = list;
        emitNotifications();
        return data.notifications;
      };
      // Both notification sources contribute to one visible list and readiness.
      feed('notifications', query(collection(db, 'userNotifications'), where('recipientUid', '==', user.uid)), snapshot => notificationMap('regular', snapshot));
      feed('_moderation', query(collection(db, 'businessModerationNotices'), where('ownerUid', '==', user.uid)), snapshot => notificationMap('moderation', snapshot));
      feed('threads', query(collection(db, 'businessMessageThreads'), where('participantUids', 'array-contains', user.uid)), snapshot => rows(snapshot).filter(row => [row.ownerUid, row.senderUid].includes(user.uid)).map(row => ({
        ...row, messages: [], unread: Number(row.unreadBy?.[user.uid] || 0),
        updatedMillis: timestampMillis(row.updatedAt || row.createdAt), blocked: row.blockedBy?.[user.uid] === true,
        blockedByOther: Object.entries(row.blockedBy || {}).some(([uid, blocked]) => uid !== user.uid && blocked === true),
      })));
      if (admin) {
        feed('members', member.role === 'superAdmin' ? collection(db, 'users')
          : query(collection(db, 'users'), where('defaultCity', '==', member.adminCity || member.defaultCity)));
        feed('statistics', collection(db, 'businessStatistics'));
      }
    }).catch(fail);
    return () => { active = false; stops.splice(0).forEach(stop => stop()); };
  }

  function listenMessages(threadId, onRows, onError) {
    let active = true, stop = () => {};
    read('businessMessageThreads', threadId).then(thread => {
      if (!active || closed) return;
      requireBusinessParticipant(thread, user.uid);
      stop = listen(query(collection(db, 'businessMessageThreads', threadId, 'messages'), orderBy('createdAt', 'asc')),
        snapshot => onRows(rows(snapshot).map(row => ({ ...row, date: dateLabel(row.createdAt) }))), onError);
    }).catch(error => { if (active && !closed) onError(error); });
    return () => { active = false; stop(); };
  }

  async function action(type, payload = {}) {
    const profile = await session();
    const id = payload.id;
    if (type === 'moderation.decide' && operationsEnabled) {
      requireDirectoryAdmin(profile);
      return invoke('decideDirectoryReport', { id, decision: payload.decision, reason: payload.reason,
        version: payload.version, expectedAppealId: payload.expectedAppealId || '',
        ...(payload.expectedAppealVersion ? {expectedAppealVersion:payload.expectedAppealVersion} : {}),
        ...(payload.expectedThreadVersion ? {expectedThreadVersion:payload.expectedThreadVersion} : {}) });
    }
    if (type === 'category.add' || type === 'category.addService') {
      requireDirectoryAdmin(profile);
      return addDirectoryCategory({ db, sdk, user, payload, service: type === 'category.addService', assertOpen: open });
    }
    if (type === 'member.update') {
      requireDirectoryAdmin(profile, null, { superOnly: true });
      if (typeof payload.isActive !== 'boolean') throw new Error('Choose the intended account access state.');
      if (id === user.uid) throw new Error('Use your own profile to manage your account.');
      const target = await read('users', id);
      if (target.role === 'superAdmin' || !['user', 'admin'].includes(payload.role)) throw new Error('This member role cannot be changed here.');
      const activeChanged = (target.isActive !== false) !== payload.isActive;
      const roleChanged = target.role !== payload.role;
      if (activeChanged && roleChanged) throw new Error('Change the role and account access separately so each result can be confirmed.');
      if (activeChanged) {
        if (target.accountStatus === 'banned') throw new Error('Banned accounts must use the dedicated Unban workflow.');
        return invoke(payload.isActive ? 'adminRestoreUser' : 'adminDeleteUser', { targetUid: id, ...(payload.isActive ? {} : { ban: false }) });
      }
      if (roleChanged) return updateDoc(doc(db, 'users', id), { role: payload.role, updatedAt: serverTimestamp() });
      return;
    }
    if (type === 'notification.appeal') {
      const notice = await read('businessModerationNotices', id);
      if (notice.ownerUid !== user.uid) throw new Error('This moderation notice belongs to another account.');
      const reason = String(payload.reason || '').trim();
      if (reason.length < 20 || reason.length > 2500) throw new Error('Explain your appeal in 20 to 2500 characters.');
      await sdk.runTransaction(db, async transaction => {
        const reference = doc(db, 'businessModerationNotices', id);
        const latest = await transaction.get(reference);
        open();
        if (!latest.exists() || latest.data().ownerUid !== user.uid) throw new Error('This notice is no longer available.');
        if (latest.data().appealStatus === 'submitted') throw new Error('An appeal has already been submitted.');
        transaction.update(reference, { appealStatus: 'submitted', appealText: reason, appealedAt: serverTimestamp(), appealedBy: user.uid });
        transaction.set(doc(collection(db, 'businessModerationAudit')), { reportId: String(notice.reportId || ''), businessId: String(notice.businessId || ''),
          action: 'business.appeal_submitted', reason, actorUid: user.uid, actorRole: 'business-owner', createdAt: serverTimestamp() });
      });
      return;
    }
    if (type === 'thread.create') {
      const businessId = idValue(payload.businessId);
      await read('publicBusinesses', businessId);
      const result = await invoke('sendBusinessEnquiry', { businessId, text: replyText(payload.text), senderName: profile.fullName });
      return { id: idValue(result?.threadId) };
    }
    if (type === 'support.submit' || type === 'thread.report') {
      if (type === 'thread.report' && operationsEnabled) {
        const result = await invoke('submitDirectoryConversationReport',{threadId:id,reason:payload.reason,requestId:payload.requestId});
        if (!result?.reference) throw new Error('The report could not be confirmed. Retry with the same reference.');
        return {...result,receiptMessage:'Your conversation report is recorded. Keep this reference for follow-up.'};
      }
      let input = payload;
      if (type === 'thread.report') {
        const thread = await read('businessMessageThreads', id);
        requireBusinessParticipant(thread, user.uid);
        input = { businessId: thread.businessId, category: 'Other', senderName: profile.fullName, senderEmail: profile.email,
          message: `Business conversation report\nConversation ID: ${thread.id}\n\n${String(payload.reason || '').trim()}`, requestId: payload.requestId };
        if (String(payload.reason || '').trim().length < 10) throw new Error('Explain the concern in at least 10 characters.');
      }
      if (!/^[a-zA-Z0-9_-]{12,100}$/.test(input.requestId || '')) throw new Error('A stable support request reference is required. Please retry the form.');
      const business = input.businessId ? await read('publicBusinesses', input.businessId) : null;
      const submission = supportPayload(input, business);
      const result = await invoke('submitSupportRequest', { ...submission, requestId: input.requestId });
      if (!result?.reference) throw new Error('Support did not return a receipt. Please retry with the same reference.');
      return { reference: result.reference, status: result.status,
        receiptMessage: result.status === 'sent' ? 'Recorded and handed to the email delivery service. Replies are handled by email.'
          : result.status === 'failed' ? 'Your report was recorded, but email delivery failed. Quote this reference to support.'
            : 'Your report was recorded for email delivery. Replies are handled by email.' };
    }
    if (['saved.add', 'saved.remove'].includes(type)) {
      idValue(id);
      if (type === 'saved.add') await read('publicBusinesses', id);
      open();
      return updateDoc(doc(db, 'users', user.uid), {
        savedBusinesses: type === 'saved.add' ? arrayUnion(id) : arrayRemove(id), updatedAt: serverTimestamp(),
      });
    }
    if (type === 'notification.read') {
      const notification = await read('userNotifications', id);
      if (notification.recipientUid !== user.uid) throw new Error('This notification belongs to another account.');
      return updateDoc(doc(db, 'userNotifications', id), { read: true, readAt: serverTimestamp() });
    }
    if (type === 'notifications.clear') {
      // Fresh server query, account scoped. Never deletes history or moderation notices.
      const snapshot = await getDocsFromServer(query(collection(db, 'userNotifications'), where('recipientUid', '==', user.uid)));
      open();
      const records = rows(snapshot);
      for (let start = 0; start < records.length; start += 400) {
        open(); const batch = writeBatch(db);
        records.slice(start, start + 400).filter(row => !row.read).forEach(row => batch.update(doc(db, 'userNotifications', row.id), { read: true, readAt: serverTimestamp() }));
        await batch.commit();
      }
      records.forEach(row => dismissed.add(row.id));
      try { storage?.setItem(dismissedKey, JSON.stringify([...dismissed])); } catch {}
      emitNotifications();
      refresh();
      return;
    }
    if (['thread.reply', 'thread.read', 'thread.block'].includes(type)) {
      const thread = await read('businessMessageThreads', id);
      requireBusinessParticipant(thread, user.uid);
      const reference = doc(db, 'businessMessageThreads', id);
      if (type === 'thread.read') return updateDoc(reference, { [`unreadBy.${user.uid}`]: 0 });
      if (type === 'thread.block') return updateDoc(reference, { [`blockedBy.${user.uid}`]: payload.blocked === true, updatedAt: serverTimestamp() });
      if (thread.adminBlocked === true || Object.values(thread.blockedBy || {}).some(Boolean)) throw new Error('This conversation is blocked.');
      const text = replyText(payload.text);
      const recipient = thread.participantUids.find(uid => uid !== user.uid);
      const batch = writeBatch(db);
      batch.set(doc(collection(reference, 'messages')), { senderUid: user.uid, senderName: profile.fullName, text, kind: 'text', createdAt: serverTimestamp() });
      batch.update(reference, { updatedAt: serverTimestamp(), lastMessage: text, lastSenderUid: user.uid,
        [`unreadBy.${user.uid}`]: 0, ...(recipient ? { [`unreadBy.${recipient}`]: increment(1) } : {}) });
      return batch.commit();
    }
    if (type === 'business.save' || type === 'promotion.save') {
      const isListing = type === 'business.save';
      const current = id ? await read(isListing ? 'businesses' : 'businessPromotions', id) : null;
      if (current && current.ownerId !== user.uid) throw new Error('Only the owner can edit this record.');
      if (current && businessService.isHistoricalBusiness(current)) throw new Error('Historical records cannot be edited.');
      if (!isListing) {
        if (current && current.businessId !== payload.businessId) throw new Error('A promotion cannot be moved to another business.');
        const parent = await read('businesses', payload.businessId);
        if (parent.ownerId !== user.uid) throw new Error('Only the business owner can manage its promotions.');
        if (businessService.isHistoricalBusiness(parent) || parent.hidden === true || parent.status !== 'approved' && parent.hasPublishedVersion !== true) {
          throw new Error('The business must be approved and public before adding promotions.');
        }
      }
      const errors = (isListing ? businessService.validateBusinessPayload : businessService.validateBusinessPromotion)(payload);
      if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
      const fields = isListing ? ['logo', 'cover'] : ['image'];
      const selected = fields.filter(field => payload[`${field}File`]);
      if (selected.length && !images) throw new Error('Image upload testing requires the Storage emulator; it is not enabled in this rehearsal.');
      // Validate every file before creating the first object.
      for (const field of selected) await inspectBusinessImage(payload[`${field}File`]);
      open();
      const submission = { ...payload };
      for (const field of fields) {
        delete submission[`${field}File`];
        submission[`${field}Path`] = current?.[`${field}Url`] && payload[`${field}Url`] === current[`${field}Url`] ? current[`${field}Path`] || '' : '';
      }
      const uploaded = [];
      try {
        for (const field of selected) {
          open();
          const result = await images.upload(payload[`${field}File`], field === 'image' ? 'promotion' : field);
          uploaded.push(result.imagePath);
          submission[`${field}Path`] = result.imagePath;
          submission[`${field}Url`] = result.imageUrl;
        }
        // Uploads can be slow: recheck account state before starting the save.
        await session();
      } catch (error) {
        await Promise.allSettled(uploaded.map(path => images.discard(path)));
        throw error;
      }
      // Once a write is attempted, an error may mean an unknown commit outcome.
      // Retain new objects on that path rather than risk deleting an image used by a committed record.
      uploaded.forEach(path => images.retain(path));
      if (type === 'business.save') {
        const result = id ? await businessService.updateBusinessSubmission(idValue(id), submission) : await businessService.createBusinessSubmission(submission);
        return { id: result || id };
      }
      const result = id ? await businessService.updateBusinessPromotion(id, submission) : await businessService.createBusinessPromotion(idValue(payload.businessId), submission);
      return { id: result || id };
    }
    if (type === 'promotion.archive') return businessService.deleteBusinessPromotion(idValue(id));
    const businessMethods = { 'business.verify': 'verifyBusinessAbn', 'business.approve': 'approveBusinessListing', 'business.reject': 'rejectBusinessListing',
      'business.archive': 'archiveBusinessListing', 'business.restore': 'restoreBusinessListing', 'business.visibility': 'setBusinessVisibility' };
    if (businessMethods[type]) {
      const business = await read('businesses', id);
      requireDirectoryAdmin(profile, business, { superOnly: type === 'business.restore' });
      return businessService[businessMethods[type]](id, type === 'business.approve' ? payload : type === 'business.visibility' ? payload.hidden === true : payload.reason);
    }
    if (['promotion.approve', 'promotion.reject'].includes(type)) {
      const promotion = await read('businessPromotions', id);
      requireDirectoryAdmin(profile, await read('businesses', promotion.businessId));
      return type === 'promotion.approve' ? businessService.approveBusinessPromotion(id, payload) : businessService.rejectBusinessPromotion(id, payload.reason);
    }
    throw new Error('This workflow still requires isolated backend integration. No changes were sent.');
  }

  return { subscribe, listenMessages, action,
    ...(operationsEnabled ? { async loadOperations({ view, cursor = '', id = '' } = {}) {
      const before = await session();
      requireDirectoryAdmin(before);
      const result = await invoke('listDirectoryOperations', { view, cursor, id, pageSize: 20 });
      const after = await session();
      requireDirectoryAdmin(after);
      if (before.role !== after.role || before.adminCity !== after.adminCity || before.defaultCity !== after.defaultCity) {
        throw new Error('Your administration scope changed. Reload the workspace.');
      }
      if (!Array.isArray(result?.supportRequests) || !Array.isArray(result?.moderationCases)
        || result.nextCursor !== null && !(view === 'appeals' ? /^[A-Za-z0-9_-]{1,200}$/ : /^[a-f0-9]{64}$/).test(result.nextCursor || '')) throw new Error('Invalid operations response. Refresh this screen.');
      return result;
    } } : {}),
    async lookupAbn(abn) {
      await session();
      const result = await businessService.lookupBusinessAbnForSubmission(abn);
      return { ...result, active: result.active === true, name: result.suggestedName || result.officialNames?.[0] || result.entityName || '' };
    },
    close() { closed = true; [...subscriptions].forEach(stop => stop()); } };
}
