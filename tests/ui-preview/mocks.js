import { isFutureSeriesEvent } from '../../src/utils/eventSeriesScope.mjs';
import { planSeriesSchedule } from '../../src/services/eventSeriesSchedule.mjs';
export const auth = { currentUser: { uid: 'synthetic-member' } };
export const db = {}, functions = {}, storage = {};
export const getApp = () => ({ options: { projectId: 'demo-ui-only' } });
export const getFunctions = () => ({});
export const httpsCallable = (_, name) => async () => ({ data: { users: window.__uiMembers || [], events: window.__uiEvents || [], videos: [], items: [], ok: true, name } });
export const signOut = async () => {};
export const doc = (...parts) => parts;
export const collection = (...parts) => parts;
export const query = (...parts) => parts;
export const where = (...parts) => parts;
export const orderBy = (...parts) => parts;
export const getDoc = async () => ({ exists: () => false, data: () => ({}) });
export const getDocs = async () => ({ docs: [], empty: true });
export const setDoc = async () => {};
export const updateDoc = async () => {};
export const deleteDoc = async () => {};
export const addDoc = async () => ({ id: 'synthetic-created' });
export const writeBatch = () => ({ set() {}, update() {}, delete() {}, commit: async () => {} });
export const limit = value => value;
export const onSnapshot = (_, listener) => { listener({ docs: [], empty: true }); return () => {}; };
export const serverTimestamp = () => 'synthetic-timestamp';
export const ref = () => ({});
export const uploadBytes = async () => ({});
export const getDownloadURL = async () => '';
export const deleteObject = async () => {};
// Stateful synthetic workflows; no network, notification permission or device token.
const threads = new Map(), messages = new Map(), reminders = new Map(), listeners = new Set();
const member = () => {
  if (!auth.currentUser?.uid) throw new Error('Sign in to continue.');
  if (window.__uiReviewStatus === 'error') throw new Error('Synthetic connection failure. Nothing was saved.');
  return auth.currentUser.uid;
};
const notify = () => listeners.forEach(listener => listener());
const watch = (read, next, error) => {
  const uid = auth.currentUser?.uid;
  const update = () => { try { next(member() === uid ? read(uid) : []); } catch (problem) { next([]); error(problem); } };
  listeners.add(update); update(); return () => listeners.delete(update);
};
const threadFor = id => {
  const uid = member(), thread = threads.get(id);
  if (!thread?.participantUids.includes(uid)) throw new Error('This conversation is not available.');
  return thread;
};
const addMessage = (id, text) => {
  const uid = member(), value = String(text).trim(), thread = threadFor(id);
  if (!value || value.length > 2000) throw new Error('Write a message of 1–2000 characters.');
  messages.set(id, [...(messages.get(id) || []), { id:crypto.randomUUID(), senderUid:uid, senderName:uid === 'synthetic-member' ? 'Example host' : 'Example visitor', text:value }]);
  Object.assign(thread, { lastMessage:value, unreadBy:Object.fromEntries(thread.participantUids.map(person => [person, person === uid ? 0 : 1])) });
  notify(); return { threadId:id };
};
export function service(name) {
  const values = {
    listenBellUnread: (_uid,next) => { next(3); return () => {}; },
    getHijriSettings: async () => ({ overrides: [] }),
    getOrganisations: async () => [],
    getMyEvents: async () => window.__uiEvents || [],
    sendHostMessage: async (eventId, text) => {
      const uid = member(), event = window.__uiEvents.find(row => row.id === eventId);
      if (!event || event.createdByUserId === uid) throw new Error('Choose another linked host.');
      const id = eventId + '_' + uid + '_' + event.createdByUserId;
      if (!threads.has(id)) threads.set(id, { id, eventTitle:event.eventType + ' · ' + event.hostName, hostUid:event.createdByUserId, senderName:'Example visitor', participantUids:[uid,event.createdByUserId] });
      return addMessage(id, text);
    },
    sendHostReply: async (id, text) => addMessage(id, text),
    markHostThreadRead: async id => { const thread = threadFor(id); thread.unreadBy = {...thread.unreadBy,[member()]:0}; },
    listenHostThreads: (next,error) => watch(uid => [...threads.values()].filter(row => row.participantUids.includes(uid)).map(row => ({...row})), next,error),
    listenHostMessages: (id,next,error) => watch(() => { threadFor(id); return [...(messages.get(id) || [])]; }, next,error),
    getEventReminder: async eventId => reminders.get(member() + ':' + eventId) || null,
    setEventReminder: async (eventId,minutesBefore) => {
      const value = {status:'pending',minutesBefore,fireAt:Date.now() + 3600000};
      reminders.set(member() + ':' + eventId,value); return value;
    },
    removeEventReminder: async eventId => { reminders.delete(member() + ':' + eventId); },
    prepareFutureSeriesEdit: async source => {
      const uid = member(), rows = window.__uiEvents.filter(row => row.seriesId === source.seriesId && isFutureSeriesEvent(row));
      if (!rows.length) throw new Error('No future occurrences remain.');
      return {...rows[0],__editSeries:true,__seriesEditorUid:uid,__futureIds:rows.map(row => row.id),__futureOccurrences:rows};
    },
    saveFutureSeriesEdit: async (source,payload,schedule=null) => {
      if (member() !== source.__seriesEditorUid) throw new Error('Your account changed. Reopen Edit Series.');
      const fields = ['hostName','hostPhone','notes','startTime','endTime','eventType','eventTypeDisplay','address','audienceType','speakerName','reciters'];
      const changes = Object.fromEntries(fields.filter(key => Object.hasOwn(payload,key)).map(key => [key,payload[key]]));
      const plan = planSeriesSchedule(source,source.__futureOccurrences,schedule);
      window.__uiEvents = window.__uiEvents.map(row => source.__futureIds.includes(row.id) ? {...row,...changes,...(plan?.[source.__futureIds.indexOf(row.id)] || {})} : row);
      return source.__futureIds.length;
    },
    prepareEventSeriesArchive: async source => {
      const rows = (window.__uiEvents || []).filter(item => item.seriesId === source.seriesId && isFutureSeriesEvent(item));
      if (!rows.length) throw new Error('No future events remain in this synthetic series.');
      return { seriesId: source.seriesId, uid: 'synthetic-member', events: rows, expectedIds: rows.map(item => item.id) };
    },
    confirmEventSeriesArchive: async preview => {
      const archivedIds = preview.expectedIds;
      window.__uiEvents = (window.__uiEvents || []).filter(item => !archivedIds.includes(item.id));
      return { archivedIds, archived: archivedIds.length, remaining: 0 };
    },
    getActiveEvents: async () => window.__uiEvents || [],
    getSavedEvents: async () => ['fixture-0'],
    listUsers: async () => window.__uiMembers || [],
    getNotificationPermissionState: () => ({ permission: 'default', supported: false }),
    hasGoogleMapsKey: () => false,
    listenLiveEvents: () => () => {},
    NativeStreamer: class {
      static isSupported() { return false; }
      async requestCamera() { throw new Error('Camera disabled for offline UI review.'); }
      async detectQuality() { return { label:'Synthetic connection' }; }
      stop() {}
    },
  };
  return values[name] || (async () => ({}));
}
