import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { toPublicBusiness } from '../utils/publicBusinesses.mjs';

// Same sanitised collection used by the native directory. No private fallback.
export function listenPublicBusinesses(onData, onError) {
  return onSnapshot(collection(db, 'publicBusinesses'), { includeMetadataChanges: true }, snapshot => {
    onData({
      businesses: snapshot.docs.map(item => toPublicBusiness(item.id, item.data())).filter(Boolean),
      fromCache: snapshot.metadata.fromCache,
    });
  }, onError);
}
