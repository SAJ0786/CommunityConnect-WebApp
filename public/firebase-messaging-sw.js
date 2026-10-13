// Install our click handler before Firebase's listener so reminder links are
// opened on this origin and expand the intended event after sign-in.
self.addEventListener('notificationclick', event => {
  const data = event.notification.data || {};
  if (data.type !== 'event-reminder') return;
  event.stopImmediatePropagation();
  event.notification.close();
  const target = new URL('/?event=' + encodeURIComponent(data.eventId || ''), self.location.origin).href;
  event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(async list => {
    const existing = list.find(client => new URL(client.url).origin === self.location.origin);
    if (existing) { await existing.navigate(target); return existing.focus(); }
    return clients.openWindow(target);
  }));
});

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

// Existing project's public web configuration.
firebase.initializeApp({
  apiKey:            "AIzaSyCEBUl1pMkQ__slfHjNMSTg6RSycRhPwmk",
  authDomain:        "community-event-8b639.firebaseapp.com",
  projectId:         "community-event-8b639",
  storageBucket:     "community-event-8b639.firebasestorage.app",
  messagingSenderId: "209723097611",
  appId:             "1:209723097611:web:b91b3970bc3ec1a4223d0e",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(payload => {
  // Firebase automatically displays notification payloads in the background.
  if (payload.notification) return;
  const { title, body, icon } = payload.data || {};
  return self.registration.showNotification(title || 'Events', {
    body:  body  || 'New community update',
    icon:  icon  || '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: payload.data?.tag,
    data: payload.data || {},
  });
});

self.addEventListener('notificationclick', event => {
  if (event.notification.data?.type === 'event-reminder') return;
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) { if (c.url.includes(self.location.origin)) return c.focus(); }
      return clients.openWindow('/');
    })
  );
});
