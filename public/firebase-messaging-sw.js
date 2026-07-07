importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

// IMPORTANT: Replace the placeholder values below with your actual Firebase config
// Copy the values from your .env file
firebase.initializeApp({
  apiKey:            "AIzaSyCEBUl1pMkQ__slfHjNMSTg6RSycRhPwmk",
  authDomain:        "community-event-8b639.firebaseapp.com",
  projectId:         "community-event-8b639",
  storageBucket:     "community-event-8b639.firebasestorage.app",
  messagingSenderId: "209723097611",
  appId:             "209723097611:web:b91b3970bc3ec1a4223d0e",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(payload => {
  const { title, body, icon } = payload.notification || {};
  self.registration.showNotification(title || 'Community Events', {
    body:  body  || 'New community update',
    icon:  icon  || '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
  });
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) { if (c.url.includes(self.location.origin)) return c.focus(); }
      return clients.openWindow('/');
    })
  );
});
