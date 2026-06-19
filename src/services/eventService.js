import {
  addDoc, collection, deleteDoc, doc, getDocs,
  orderBy, query, serverTimestamp, updateDoc, where, onSnapshot
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase/firebase';

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
  return addDoc(collection(db, 'events'), {
    ...event,
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
  return updateDoc(doc(db, 'events', id), {
    ...event,
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

  const snap = await getDocs(
    query(
      collection(db, 'events'),
      where('status', '==', 'active'),
      orderBy('eventDate', 'asc')
    )
  );
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(e => !e.hidden);
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
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
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
