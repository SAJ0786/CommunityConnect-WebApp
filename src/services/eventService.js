import {
  addDoc, collection, deleteDoc, doc, getDocs,
  orderBy, query, serverTimestamp, updateDoc, where, onSnapshot, limit
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase/firebase';
import { compareEventsByDateTime, localDateStr } from './dateUtils';
import { classifyMetroArea } from '../utils/cities';

export function validateRequiredEventFields(event) {
  const eventDate = String(event?.eventDate || '').trim();
  const startTime = String(event?.startTime || '').trim();
  const address = typeof event?.address === 'string'
    ? event.address.trim()
    : String(event?.address?.fullAddress || '').trim();
  const missing = [
    !eventDate ? 'date' : '',
    !startTime ? 'start time' : '',
    address.length < 5 ? 'address' : '',
  ].filter(Boolean);
  if (missing.length) throw new Error(`Event cannot be saved without ${missing.join(', ')}.`);
}

// ── Real-time listener for events currently marked isLive ────────────────────
// Fires immediately when a stream starts/ends — keeps "LIVE NOW" / "Watch on
// YouTube" badges in sync across all open apps without needing a full reload.
export function listenLiveEvents(callback) {
  const q = query(collection(db, 'events'), where('isLive', '==', true));
  return onSnapshot(q, (snap) => {
    const liveEvents = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    callback(liveEvents);
  }, (err) => console.warn('[listenLiveEvents] error:', err.message));
}

export async function createEvent(event, user, profile) {
  validateRequiredEventFields(event);
  return addDoc(collection(db, 'events'), {
    ...event,
    metroArea: classifyMetroArea(event.address),
    status: 'active',
    hidden: false,
    createdByUserId: user.uid,
    createdByUserEmail: user.email,
    submittedByName: profile?.fullName || user.displayName || user.email,
    submittedByRole: profile?.role || 'user',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

export async function updateEvent(id, event) {
  validateRequiredEventFields(event);
  return updateDoc(doc(db, 'events', id), {
    ...event,
    metroArea: classifyMetroArea(event.address),
    updatedAt: serverTimestamp()
  });
}

export async function deleteEvent(id) {
  return deleteDoc(doc(db, 'events', id));
}

// Home page + AI Search — exclude hidden events
export async function getActiveEvents(isGuest = false) {
  if (isGuest) {
    const fn = httpsCallable(functions, 'getPublicEvents');
    const result = await fn();
    return result.data?.events || [];
  }

  const yesterday = localDateStr(-1);
  const [upcomingSnap, liveSnap] = await Promise.all([
    getDocs(query(
      collection(db, 'events'),
      where('status', '==', 'active'),
      where('eventDate', '>=', yesterday),
      orderBy('eventDate', 'asc'),
      limit(750)
    )),
    getDocs(query(collection(db, 'events'), where('isLive', '==', true))),
  ]);

  const byId = new Map();
  [...upcomingSnap.docs, ...liveSnap.docs].forEach(item => {
    const event = { id: item.id, ...item.data() };
    if (event.status === 'active' && !event.hidden) byId.set(item.id, event);
  });

  return [...byId.values()]
    .filter(e => !e.hidden)
    .sort(compareEventsByDateTime);
}

// My Events — all events by this user including hidden ones
export async function getMyEvents(uid) {
  const snap = await getDocs(
    query(
      collection(db, 'events'),
      where('status', '==', 'active'),
      where('createdByUserId', '==', uid),
      orderBy('eventDate', 'asc')
    )
  );
  return snap.docs.map(d => ({ id: d.id, ...d.data() })).sort(compareEventsByDateTime);
}

export async function goLive(id, roomCode) {
  return updateDoc(doc(db, 'events', id), {
    isLive:        true,
    liveUrl:       roomCode,
    liveRoomCode:  roomCode,
    liveStartedAt: new Date().toISOString(),
    updatedAt:     serverTimestamp(),
  });
}

export async function endLive(id) {
  return updateDoc(doc(db, 'events', id), {
    isLive:       false,
    liveUrl:      null,
    liveWatchUrl: null,
    liveSource:   null,
    liveEndedAt:  new Date().toISOString(),
    updatedAt:    serverTimestamp(),
  });
}

export async function toggleEventVisibility(id, hidden) {
  return updateDoc(doc(db, 'events', id), {
    hidden,
    hiddenAt: hidden ? serverTimestamp() : null,
    updatedAt: serverTimestamp(),
  });
}
