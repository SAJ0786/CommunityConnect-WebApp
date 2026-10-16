const clean = value => String(value || '').trim();
export const eventHostUid = event => clean(event?.createdByUserId || event?.ownerUid || event?.createdByUid || event?.userId);
const millis = value => value?.toMillis?.() || value?.seconds * 1000 || Date.parse(value) || 0;
export function createHostMessaging({ db, sdk, currentUser, readOnly = false, registrationEvent }) {
  const id = value => {
    if (typeof value !== 'string' || !value.trim() || value.includes('/')) throw new Error('A valid reference is required.');
    return value;
  };
  const reference = (kind, value) => sdk.doc(db, kind, id(value));
  async function session(writing = false) {
    if (writing && readOnly) throw new Error('Disabled in the read-only preview.');
    const user = currentUser();
    if (!user?.uid || user.isAnonymous) throw new Error('Sign in to use Host Inbox.');
    const profile = (await sdk.getDocFromServer(reference('users', user.uid))).data();
    if (currentUser()?.uid !== user.uid) throw new Error('Your account changed. Reopen Host Inbox.');
    if (!profile || profile.isActive === false || profile.active === false || ['archived', 'deleted', 'banned'].includes(profile.accountStatus)) throw new Error('An active member account is required.');
    return { uid: user.uid, name: clean(profile.fullName) || 'Community member' };
  }
  const same = uid => { if (currentUser()?.uid !== uid) throw new Error('Your account changed. Reopen Host Inbox.'); };
  const textValue = text => {
    const value = clean(text);
    if (!value || value.length > 2000) throw new Error('Write a message of 1–2000 characters.');
    return value;
  };
  const participant = (thread, uid) => {
    if (!thread?.participantUids?.includes(uid) || thread.participantUids.length !== 2) throw new Error('This conversation is not available to your account.');
  };
  async function send(eventId, text, { registrationOnly = false } = {}) {
    const message = textValue(text), member = await session(true);
    let event;
    if (registrationOnly) {
      if (!registrationEvent) throw new Error('Registration host messaging is not connected.');
      const fresh = await registrationEvent(eventId);
      if (!fresh?.event || fresh.event.status !== 'approved' || fresh.event.deletedAt) throw new Error('This event is no longer available.');
      event = { ...fresh.event, eventDate: fresh.event.date, hostName: fresh.event.title };
    } else {
      const snapshot = await sdk.getDocFromServer(reference('events', eventId));
      if (!snapshot.exists()) throw new Error('This event is no longer available.');
      event = snapshot.data();
    }
    same(member.uid);
    const hostUid = eventHostUid(event);
    if (event.hidden || ['inactive', 'archived', 'deleted', 'cancelled'].includes(event.status)) throw new Error('This event is no longer available.');
    if (!hostUid || hostUid === member.uid) throw new Error('Choose an event with another linked host.');
    const threadId = id(eventId + '_' + member.uid + '_' + hostUid);
    const threadRef = reference('hostMessageThreads', threadId);
    // A participant query avoids reading a non-existent private thread, which
    // the native rules correctly refuse before it has any participants.
    const owned = await sdk.getDocsFromServer(sdk.query(sdk.collection(db, 'hostMessageThreads'), sdk.where('participantUids', 'array-contains', member.uid)));
    const previous = owned.docs.find(row => row.id === threadId)?.data();
    if (previous) participant(previous, member.uid);
    const timestamp = sdk.serverTimestamp();
    const state = { updatedAt: timestamp, lastMessage: message, lastSenderUid: member.uid,
      unreadBy: { [hostUid]: sdk.increment(1), [member.uid]: 0 } };
    const batch = sdk.writeBatch(db);
    if (previous) batch.set(threadRef, state, { merge: true });
    else batch.set(threadRef, { ...state, type: 'host', eventId,
      eventTitle: (event.eventTypeDisplay || event.eventType || 'Event') + ' - ' + (event.hostName || 'Host'),
      eventDate: event.eventDate || '', eventCity: event.metroArea || event.city || 'sydney',
      hostUid, hostName: clean(event.createdByName || event.hostName) || 'Host', senderUid: member.uid,
      senderName: member.name, participantUids: [member.uid, hostUid], createdAt: timestamp });
    batch.set(sdk.doc(sdk.collection(threadRef, 'messages')), { senderUid: member.uid, senderName: member.name, text: message, kind: 'text', createdAt: timestamp });
    same(member.uid); await batch.commit(); same(member.uid);
    return { threadId };
  }
  async function reply(threadId, text) {
    const message = textValue(text), member = await session(true), ref = reference('hostMessageThreads', threadId);
    const thread = (await sdk.getDocFromServer(ref)).data();
    participant(thread, member.uid);
    const other = thread.participantUids.find(uid => uid !== member.uid), batch = sdk.writeBatch(db);
    batch.set(sdk.doc(sdk.collection(ref, 'messages')), { senderUid: member.uid, senderName: member.name, text: message, kind: 'text', createdAt: sdk.serverTimestamp() });
    batch.update(ref, { updatedAt: sdk.serverTimestamp(), lastMessage: message, lastSenderUid: member.uid,
      ['unreadBy.' + member.uid]: 0, ['unreadBy.' + other]: sdk.increment(1) });
    same(member.uid); await batch.commit(); same(member.uid);
  }
  async function markRead(threadId) {
    const member = await session(true), ref = reference('hostMessageThreads', threadId);
    participant((await sdk.getDocFromServer(ref)).data(), member.uid);
    same(member.uid); await sdk.updateDoc(ref, { ['unreadBy.' + member.uid]: 0 });
  }
  function watch(threadId, next, error) {
    let active = true, stop = () => {};
    next([]);
    session().then(member => {
      if (!active) return;
      const query = threadId
        ? sdk.query(sdk.collection(reference('hostMessageThreads', threadId), 'messages'), sdk.orderBy('createdAt', 'desc'), sdk.limit(200))
        : sdk.query(sdk.collection(db, 'hostMessageThreads'), sdk.where('participantUids', 'array-contains', member.uid));
      stop = sdk.onSnapshot(query, snapshot => {
        if (!active) return;
        if (currentUser()?.uid !== member.uid) { next([]); stop(); return; }
        const rows = snapshot.docs.map(row => ({ ...row.data(), id: row.id }));
        next(threadId ? rows.reverse() : rows.filter(row => row.participantUids?.includes(member.uid)).sort((a, b) => millis(b.updatedAt) - millis(a.updatedAt)));
      }, problem => { if (active) { next([]); error(problem); } });
    }).catch(problem => { if (active) { next([]); error(problem); } });
    return () => { active = false; stop(); };
  }
  return { send, reply, markRead, watchThreads: (next, error) => watch(null, next, error), watchMessages: watch };
}
