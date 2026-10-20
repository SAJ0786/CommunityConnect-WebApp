import { registrationNotificationLink } from '../registration/registrationLinks.mjs';
import { doc, setDoc, serverTimestamp, collection, query, where, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions, getMessagingInstance, getToken, onMessage } from '../firebase/firebase';
import { registerMessagingWorker } from './workerRegistration.mjs';

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY || '';
let foregroundUnsubscribe = null;

function getWebPushVapidKey() {
  const key = String(VAPID_KEY || '').trim().replace(/=+$/g, '');
  if (!key || /[^A-Za-z0-9_-]/.test(key)) {
    throw new Error('Web push key is not configured correctly. Please contact support.');
  }
  return key;
}

function getIOSNativePushBridge() {
  try {
    const handlers = window.webkit?.messageHandlers;
    if (handlers?.['push-permission-request'] && handlers?.['push-token']) return handlers;
  } catch {
    // Not running in an iOS WKWebView wrapper.
  }
  return null;
}

function waitForNativePushToken(timeoutMs = 8000) {
  return new Promise(resolve => {
    const existing = window.__communityEventsNativePushToken;
    if (existing) {
      resolve({ token: existing, platform: window.__communityEventsNativePushPlatform || 'native' });
      return;
    }

    let done = false;
    const finish = value => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      window.removeEventListener('community-events-native-push-token', onToken);
      resolve(value);
    };
    const onToken = event => finish(event.detail || null);
    const timer = setTimeout(() => finish(null), timeoutMs);
    window.addEventListener('community-events-native-push-token', onToken);
  });
}

export function getNotificationPermissionState() {
  if (typeof window === 'undefined') {
    return { supported: false, permission: 'unsupported', native: false };
  }

  const nativeToken = window.__communityEventsNativePushToken;
  if (nativeToken) {
    return { supported: true, permission: 'granted', native: true };
  }

  if (getIOSNativePushBridge()) {
    return { supported: true, permission: 'native', native: true };
  }

  const webSupported = 'Notification' in window && 'serviceWorker' in navigator;
  return {
    supported: webSupported,
    permission: webSupported ? Notification.permission : 'unsupported',
    native: false,
  };
}

/**
 * Request notification permission and store FCM token in Firestore.
 * Call this after a user successfully logs in.
 */
export async function requestNotificationPermission(uid) {
  return enablePushNotifications(uid);
}

export async function enablePushNotifications(uid) {
  try {
    if (!uid) return null;

    const nativeToken = window.__communityEventsNativePushToken;
    if (nativeToken) {
      await savePushToken(uid, nativeToken, window.__communityEventsNativePushPlatform || 'native', 'native');
      return nativeToken;
    }

    const iosNativeBridge = getIOSNativePushBridge();
    if (iosNativeBridge) {
      iosNativeBridge['push-permission-request'].postMessage('');
      const nativeResult = await waitForNativePushToken();
      if (nativeResult?.token) {
        await savePushToken(uid, nativeResult.token, nativeResult.platform || 'ios-native', 'native');
        return nativeResult.token;
      }
      return null;
    }

    if (!('Notification' in window)) return null;
    if (!('serviceWorker' in navigator)) return null;

    const messaging = await getMessagingInstance();
    if (!messaging) return null;

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.log('Notification permission denied');
      return null;
    }

    // Register service worker for FCM
    const swReg = await registerMessagingWorker(navigator.serviceWorker);

    // Get FCM token
    const token = await getToken(messaging, {
      vapidKey: getWebPushVapidKey(),
      serviceWorkerRegistration: swReg,
    });

    if (!token) return null;

    await savePushToken(uid, token, getPlatform(), 'web');
    // Permission can be granted from Reminder after the app's initial effect.
    await startForegroundPushNotifications().catch(() => {});

    console.log('FCM token saved for user:', uid);
    return token;
  } catch (e) {
    console.warn('FCM setup error:', e.message);
    return null;
  }
}

export async function syncGrantedNotificationToken(uid, profile = {}) {
  if (!uid) return null;
  const nativeToken = window.__communityEventsNativePushToken;
  if (nativeToken) {
    await savePushToken(uid, nativeToken, window.__communityEventsNativePushPlatform || 'native', 'native');
    return nativeToken;
  }

  const iosNativeBridge = getIOSNativePushBridge();
  if (iosNativeBridge) {
    iosNativeBridge['push-token'].postMessage('');
    const nativeResult = await waitForNativePushToken(3000);
    if (nativeResult?.token) {
      await savePushToken(uid, nativeResult.token, nativeResult.platform || 'ios-native', 'native');
      return nativeResult.token;
    }
  }

  const state = getNotificationPermissionState();
  if (!state.supported || state.permission !== 'granted') return null;

  const messaging = await getMessagingInstance();
  if (!messaging) return null;
  const swReg = await registerMessagingWorker(navigator.serviceWorker);
  const token = await getToken(messaging, {
    vapidKey: getWebPushVapidKey(),
    serviceWorkerRegistration: swReg,
  });
  if (!token) return null;
  await savePushToken(uid, token, getPlatform(), 'web');
  return token;
}

export async function saveNativePushToken(uid, token, platform = 'android-native') {
  if (!uid || !token) return null;
  await savePushToken(uid, token, platform, 'native');
  return token;
}

export async function sendTestPushNotification() {
  const call = httpsCallable(functions, 'sendTestPushNotification');
  const result = await call({});
  return result.data;
}

export async function showLocalTestNotification() {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return { shown: false, reason: 'unsupported' };
  }
  if (Notification.permission !== 'granted') {
    return { shown: false, reason: Notification.permission || 'not-granted' };
  }

  const title = 'Community Events local notification test';
  const options = {
    body: 'Windows notification display is working for this app.',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { type: 'local-test', url: '/' },
  };

  try {
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification(title, options);
    return { shown: true, via: 'service-worker' };
  } catch {
    try {
      new Notification(title, options);
      return { shown: true, via: 'notification-api' };
    } catch (error) {
      return { shown: false, reason: error.message || 'display-failed' };
    }
  }
}

export async function startForegroundPushNotifications() {
  if (foregroundUnsubscribe) return foregroundUnsubscribe;
  if (typeof window === 'undefined') return null;
  if (!('Notification' in window) || Notification.permission !== 'granted') return null;

  const messaging = await getMessagingInstance();
  if (!messaging) return null;

  foregroundUnsubscribe = onMessage(messaging, async payload => {
    const notification = payload.notification || payload.data || {};
    const title = notification.title || 'Events';
    const options = {
      body: notification.body || 'New community update',
      icon: notification.icon || '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: payload.data || {},
      tag: payload.data?.tag,
    };

    try {
      const registration = await registerMessagingWorker(navigator.serviceWorker);
      await registration.showNotification(title, options);
    } catch {
      try {
        const notification = new Notification(title, options);
        if (registrationNotificationLink(payload.data)) notification.onclick = () => { window.location.assign(registrationNotificationLink(payload.data)); };
        else if (payload.data?.module === 'events') notification.onclick = () => {
          const params = new URLSearchParams({
            notice: payload.data.threadId ? 'host-inbox' : 'notifications',
            recipient: payload.data.recipientUid || '',
            ...(payload.data.threadId ? { thread: payload.data.threadId } : {}),
          });
          window.location.assign('/?' + params.toString());
        };
        else if (payload.data?.type === 'event-reminder') notification.onclick = () => {
          window.location.assign('/?event=' + encodeURIComponent(payload.data.eventId || ''));
        };
      } catch {
        // Browser denied or suppressed foreground notification display.
      }
    }
  });

  return foregroundUnsubscribe;
}

async function savePushToken(uid, token, platform, source) {
  await setDoc(doc(db, 'users', uid), {
    fcmTokens: {
      [token]: {
        createdAt: serverTimestamp(),
        platform,
        source,
      },
    },
    pushNotificationsEnabled: true,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

function getPlatform() {
  const ua = navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  if (/android/i.test(ua)) return 'android';
  return 'web';
}

export function listenBellUnread(uid, onCount, onError = () => {}) {
  if (!uid) { onCount(0); return () => {}; }
  return onSnapshot(query(collection(db, 'userNotifications'), where('recipientUid','==',uid)),
    snapshot => onCount(snapshot.docs.filter(doc => doc.data().read !== true).length), onError);
}
