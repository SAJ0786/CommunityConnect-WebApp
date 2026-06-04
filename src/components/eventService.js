import {
  addDoc, collection, deleteDoc, doc, getDocs,
  orderBy, query, serverTimestamp, updateDoc, where
} from 'firebase/firestore';
import { db } from '../firebase/firebase';

export async function createEvent(event, user, profile) {
  return addDoc(collection(db, 'events'), {
    ...event,
    status: 'active',
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

export async function getActiveEvents() {
  const snap = await getDocs(
    query(
      collection(db, 'events'),
      where('status', '==', 'active'),
      orderBy('eventDate', 'asc')
    )
  );
  // Filter out admin-hidden events on the client side
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(e => !e.hidden);
}

export async function toggleEventVisibility(id, hidden) {
  return updateDoc(doc(db, 'events', id), {
    hidden,
    hiddenAt: hidden ? serverTimestamp() : null,
    updatedAt: serverTimestamp(),
  });
}
