import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { toPublicPromotion } from '../utils/publicPromotions.mjs';

export function listenPublicPromotions(onData, onError) {
  return onSnapshot(collection(db, 'publicBusinessPromotions'), { includeMetadataChanges: true }, snapshot => {
    onData({ promotions: snapshot.docs.map(item => toPublicPromotion(item.id, item.data())).filter(Boolean), fromCache: snapshot.metadata.fromCache });
  }, onError);
}
