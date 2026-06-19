import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, browserLocalPersistence, setPersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';
import { getStorage } from 'firebase/storage';
import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging';

// ─────────────────────────────────────────────────────────────────────────────
// YOUR FIREBASE CONFIG — paste your values from Firebase Console here directly.
// Firebase Console → Project Settings → Your apps → Web app → SDK snippet
//
// ALSO copy these same values into your .env file as VITE_FIREBASE_* variables
// so that npm run build picks them up correctly.
// ─────────────────────────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY            || "",
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN        || "",
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID         || "",
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET     || "",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID|| "",
  appId:             import.meta.env.VITE_FIREBASE_APP_ID             || ""
};

export const firebaseConfigured =
  !!firebaseConfig.apiKey && firebaseConfig.apiKey.length > 10;

const app = initializeApp(firebaseConfig);

export const auth           = getAuth(app);
export const db             = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
export const functions      = getFunctions(app, 'australia-southeast1');
export const storage        = getStorage(app);

// Set auth persistence globally
setPersistence(auth, browserLocalPersistence).catch(() => {});

// FCM Messaging — only available in browsers that support it
let _messaging = null;
export const getMessagingInstance = async () => {
  if (_messaging) return _messaging;
  try {
    const supported = await isSupported();
    if (supported) {
      _messaging = getMessaging(app);
      return _messaging;
    }
  } catch (e) { console.warn('FCM not supported:', e.message); }
  return null;
};

export { getToken, onMessage };
export default app;
