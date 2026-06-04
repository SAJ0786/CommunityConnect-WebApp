import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, getMessagingInstance, getToken } from '../firebase/firebase';

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY || '';

/**
 * Request notification permission and store FCM token in Firestore.
 * Call this after a user successfully logs in.
 */
export async function requestNotificationPermission(uid) {
  try {
    // Check browser support
    if (!('Notification' in window)) return null;
    if (!('serviceWorker' in navigator)) return null;

    const messaging = await getMessagingInstance();
    if (!messaging) return null;

    // Request permission
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.log('Notification permission denied');
      return null;
    }

    // Register service worker for FCM
    const swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');

    // Get FCM token
    const token = await getToken(messaging, {
      vapidKey:        VAPID_KEY,
      serviceWorkerRegistration: swReg,
    });

    if (!token) return null;

    // Save token to Firestore under user's document
    await setDoc(doc(db, 'users', uid), {
      fcmTokens: { [token]: { createdAt: serverTimestamp(), platform: getPlatform() } },
      updatedAt: serverTimestamp(),
    }, { merge: true });

    console.log('FCM token saved for user:', uid);
    return token;
  } catch (e) {
    console.warn('FCM setup error:', e.message);
    return null;
  }
}

function getPlatform() {
  const ua = navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  if (/android/i.test(ua)) return 'android';
  return 'web';
}
