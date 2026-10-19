import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { parseEventOptions } from '../utils/eventOptions.mjs';

export async function getDynamicEventOptions() {
  const snapshot = await getDoc(doc(db, 'settings', 'eventOptions'));
  return parseEventOptions(snapshot.exists() ? snapshot.data() : {});
}
