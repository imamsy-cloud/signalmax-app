// File: sw.js (Service Worker)
// Versi 2.0: Ditambahkan Firebase Cloud Messaging

// Import script Firebase (diperlukan untuk service worker)
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

// Inisialisasi aplikasi Firebase di dalam service worker
// NOTE: Nilai-nilai ini tidak sensitif karena hanya untuk inisialisasi SDK.
const firebaseConfig = {
    apiKey: "AIzaSyBKQ-TUZGJXNGbBnndopvmRU7k09Y27a18",
    authDomain: "app-signalmax.firebaseapp.com",
    projectId: "app-signalmax",
    storageBucket: "app-signalmax.firebasestorage.app",
    messagingSenderId: "37736772936",
    appId: "1:37736772936:web:fa6dc7c77fce564bc4af7d",
    measurementId: "G-EVV9FSK7GB"
};
firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

// Handler untuk menampilkan notifikasi saat aplikasi berada di background
messaging.onBackgroundMessage((payload) => {
  console.log('[sw.js] Received background message ', payload);
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: payload.notification.icon || '/icons/icon-192x192.png'
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});


const CACHE_NAME = 'signalmax-cache-v1';
const FILES_TO_CACHE = [
  '/',
  '/index.html',
  '/src/css/style.css',
  '/src/js/main.js',
  '/src/js/router.js',
  '/src/js/ui.js',
  '/src/js/api.js',
  '/src/js/auth.js',
  '/src/js/config.template.js',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[ServiceWorker] Pre-caching offline page');
      return cache.addAll(FILES_TO_CACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => {
        if (key !== CACHE_NAME) {
          console.log('[ServiceWorker] Removing old cache', key);
          return caches.delete(key);
        }
      }));
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }
  
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cachedResponse = await cache.match(event.request);
      if (cachedResponse) {
        return cachedResponse;
      }
      try {
        const networkResponse = await fetch(event.request);
        event.waitUntil(cache.put(event.request, networkResponse.clone()));
        return networkResponse;
      } catch (error) {
        console.error('[ServiceWorker] Fetch failed.', error);
      }
    })
  );
});
