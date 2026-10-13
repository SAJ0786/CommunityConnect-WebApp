import { collection, query, where, getDocsFromServer, doc, getDocFromServer } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { callMemberOperation } from './memberCallable.mjs';
import { auth, db, functions } from '../firebase/firebase';
import { createEventSeriesArchive } from './eventSeriesArchive.mjs';

async function session() {
  if (import.meta.env.VITE_READ_ONLY_PREVIEW === 'true') throw new Error('Disabled in the read-only preview.');
  const uid = auth.currentUser?.uid;
  if (!uid || auth.currentUser.isAnonymous) throw new Error('Sign in to manage this series.');
  const result = await getDocFromServer(doc(db, 'users', uid)), profile = result.data();
  if (auth.currentUser?.uid !== uid) throw new Error('Your account changed. Reopen Delete Series.');
  if (!result.exists() || !['admin', 'superAdmin'].includes(profile?.role) || profile.isActive === false
    || profile.active === false || ['archived', 'deleted', 'banned'].includes(profile.accountStatus)) {
    throw new Error('An active administrator account is required to delete a series.');
  }
  return uid;
}
const service = createEventSeriesArchive({
  session,
  readSeries: async (field, id) => {
    const result = await getDocsFromServer(query(collection(db, 'events'), where(field, '==', id)));
    return result.docs.map(item => ({ ...item.data(), id: item.id }));
  },
  archive: async payload => (await callMemberOperation(httpsCallable, functions, 'archiveFutureSeriesEvents', payload)).data,
});
export async function prepareEventSeriesArchive(event) { return service.prepare(event); }
export async function confirmEventSeriesArchive(preview) { return service.confirm(preview); }
