'use strict';
// Release candidate. Registration is deliberately absent from functions/index.js.
const { createHash } = require('node:crypto');
const hash = value => createHash('sha256').update(value).digest('hex');
const zones = { sydney:'Australia/Sydney', melbourne:'Australia/Melbourne', canberra:'Australia/Sydney', brisbane:'Australia/Brisbane', adelaide:'Australia/Adelaide', hobart:'Australia/Hobart', perth:'Australia/Perth', darwin:'Australia/Darwin' };
const states = { NSW:'Australia/Sydney', VIC:'Australia/Melbourne', ACT:'Australia/Sydney', QLD:'Australia/Brisbane', SA:'Australia/Adelaide', TAS:'Australia/Hobart', WA:'Australia/Perth', NT:'Australia/Darwin' };
function eventStartAt(event) {
  const date = String(event.eventDate || ''), match = String(event.startTime || '').trim().match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !match) throw new Error('The event needs a valid date and start time.');
  const parsed = new Date(date + 'T00:00:00Z');
  let hour = Number(match[1]), minute = Number(match[2]);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date || minute > 59 || (match[3] ? hour < 1 || hour > 12 : hour > 23)) throw new Error('The event date or start time is invalid.');
  if (match[3]) hour = hour % 12 + (match[3].toUpperCase() === 'PM' ? 12 : 0);
  const zone = zones[String(event.metroArea || event.city || '').toLowerCase()] || states[event.address?.state] || event.prayerTimeZone || 'Australia/Sydney';
  const wall = parsed.getTime() + (hour * 60 + minute) * 60000;
  const formatter = new Intl.DateTimeFormat('en-GB', { timeZone: zone, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23' });
  const local = instant => {
    const p = Object.fromEntries(formatter.formatToParts(new Date(instant)).map(part => [part.type, part.value]));
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  };
  const offsets = new Set([-86400000, 0, 86400000].map(delta => local(wall + delta) - (wall + delta)));
  const matches = [...offsets].map(offset => wall - offset).filter(candidate => local(candidate) === wall);
  if (matches.length !== 1) throw new Error('This event time falls in a daylight-saving clock change. Ask the host to clarify the time.');
  return matches[0];
}
exports.eventStartAt = eventStartAt;
exports.createReminderHandlers = ({ db, HttpsError, now = Date.now }) => {
  const fail = (code, message) => { throw new HttpsError(code, message); };
  const eligible = profile => profile && profile.isActive !== false && profile.active !== false && !['archived','banned','deleted'].includes(profile.accountStatus);
  const available = event => event && !event.hidden && !event.isLive && !['inactive','archived','deleted','cancelled'].includes(event.status);
  const ref = (collection, id) => db.collection(collection).doc(id);
  const requestParts = request => {
    const uid = request.auth?.uid, data = request.data || {};
    if (!uid || request.auth.token?.firebase?.sign_in_provider === 'anonymous') fail('unauthenticated', 'Sign in to manage reminders.');
    if (typeof data.eventId !== 'string' || !data.eventId || data.eventId.includes('/') || !/^[a-zA-Z0-9-]{16,80}$/.test(data.deviceId || '')) fail('invalid-argument', 'A valid event and browser reference are required.');
    return { uid, data, record: ref('webEventReminders', hash(JSON.stringify([uid, data.eventId, data.deviceId]))) };
  };
  const result = data => data ? { status: data.status, minutesBefore: data.minutesBefore, fireAt: data.fireAt, eventStartAt: data.eventStartAt, delivery: data.delivery || null } : null;
  async function get(request) {
    const { uid, record } = requestParts(request);
    if (!eligible((await ref('users', uid).get()).data())) fail('permission-denied', 'An active account is required.');
    return { reminder: result((await record.get()).data()) };
  }
  async function set(request) {
    const { uid, data, record } = requestParts(request);
    if (![15,30,60,180,1440].includes(data.minutesBefore) || typeof data.token !== 'string' || !data.token) fail('invalid-argument', 'Choose a reminder time and enable browser notifications.');
    return db.runTransaction(async transaction => {
      const [user, eventDoc, old] = await transaction.getAll(ref('users', uid), ref('events', data.eventId), record);
      const profile = user.data(), event = eventDoc.data();
      if (!eligible(profile) || profile.pushNotificationsEnabled === false || profile.fcmTokens?.[data.token]?.source !== 'web') fail('permission-denied', 'Enable notifications for this browser first.');
      if (!available(event)) fail('failed-precondition', 'This event is no longer available for a reminder.');
      let start;
      try { start = eventStartAt(event); } catch (error) { fail('failed-precondition', error.message); }
      const fireAt = start - data.minutesBefore * 60000;
      if (fireAt <= now()) fail('failed-precondition', 'That reminder time has already passed. Choose a shorter lead time.');
      const previous = old.data();
      if (previous?.status === 'pending' && previous.fireAt === fireAt && previous.token === data.token && previous.minutesBefore === data.minutesBefore) return { reminder: result(previous) };
      const next = { uid, eventId: data.eventId, deviceId: data.deviceId, token: data.token, minutesBefore: data.minutesBefore,
        status: 'pending', revision: (previous?.revision || 0) + 1, fireAt, eventStartAt: start, updatedAt: now() };
      transaction.set(record, next);
      return { reminder: result(next) };
    });
  }
  async function remove(request) {
    const { uid, record } = requestParts(request);
    return db.runTransaction(async transaction => {
      const [user, snapshot] = await transaction.getAll(ref('users', uid), record);
      if (!eligible(user.data())) fail('permission-denied', 'An active account is required.');
      if (snapshot.exists) transaction.update(record, { status:'cancelled', revision:(snapshot.data().revision || 0) + 1, updatedAt:now() });
      return { removed: true };
    });
  }
  // Atomic claim prevents overlapping workers from dispatching the same revision.
  async function process(recordId, deliver) {
    const record = ref('webEventReminders', recordId);
    const claimed = await db.runTransaction(async transaction => {
      const snapshot = await transaction.get(record), saved = snapshot.data();
      if (!saved) return null;
      if (saved.status === 'dispatching') {
        if (now() - saved.updatedAt > 5 * 60000) transaction.update(record, {status:'delivery-unconfirmed',delivery:'unconfirmed',updatedAt:now()});
        return null;
      }
      if (saved.status !== 'pending') return null;
      const [user, eventDoc] = await transaction.getAll(ref('users', saved.uid), ref('events', saved.eventId));
      const profile = user.data(), event = eventDoc.data();
      let start;
      try { start = eventStartAt(event || {}); } catch (_) { start = 0; }
      if (!eligible(profile) || profile.pushNotificationsEnabled === false || profile.fcmTokens?.[saved.token]?.source !== 'web'
        || !available(event) || start <= now()) {
        transaction.update(record, { status:'cancelled', delivery:'event-or-account-unavailable', updatedAt:now() }); return null;
      }
      const fireAt = start - saved.minutesBefore * 60000;
      if (fireAt > now()) {
        if (fireAt !== saved.fireAt) transaction.update(record, { fireAt, eventStartAt:start, updatedAt:now() });
        return null;
      }
      // At-most-once dispatch: an uncertain delivery is retained for review,
      // never retried automatically with a duplicate visible notification.
      transaction.update(record, { status:'dispatching', updatedAt:now() });
      return { ...saved, eventStartAt:start, title:'Event reminder', body:(event.eventTypeDisplay || event.eventType || 'Event') + ' · ' + (event.hostName || 'Community host'), tag:recordId + '-' + saved.revision };
    });
    if (!claimed) return { delivered:false };
    // Re-read cancellation/replacement before the external side effect.
    const latest = (await record.get()).data();
    if (latest?.status !== 'dispatching' || latest.revision !== claimed.revision) return { delivered:false };
    let delivery;
    try { await deliver({ token:claimed.token, title:claimed.title, body:claimed.body, tag:claimed.tag, eventId:claimed.eventId, ttlSeconds:Math.max(0,Math.floor((claimed.eventStartAt - now()) / 1000)) }); delivery = 'acknowledged'; }
    catch (_) { delivery = 'unconfirmed'; }
    await db.runTransaction(async transaction => {
      const snapshot = await transaction.get(record);
      if (snapshot.data()?.revision === claimed.revision && snapshot.data()?.status === 'dispatching') transaction.update(record, { status:delivery === 'acknowledged' ? 'sent' : 'delivery-unconfirmed', delivery, updatedAt:now() });
    });
    return { delivered:delivery === 'acknowledged' };
  }
  return { get, set, remove, process };
};
