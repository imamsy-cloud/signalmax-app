// File: sw.js (Versi Perbaikan Final dengan Error Handling)

// 1. Impor skrip Firebase
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

console.log('[sw.js] File Service Worker berhasil dimuat.');

try {
  // 2. PASTE KONFIGURASI FIREBASE ANDA DI SINI
  const firebaseConfig = {
    apiKey: "AIzaSyBKQ-TUZGJXNGbBnndopvmRU7k09Y27a18",
    authDomain: "app-signalmax.firebaseapp.com",
    projectId: "app-signalmax",
    storageBucket: "app-signalmax.firebasestorage.app",
    messagingSenderId: "37736772936",
    appId: "1:37736772936:web:fa6dc7c77fce564bc4af7d",
    measurementId: "G-EVV9FSK7GB"
  };

  // 3. Inisialisasi Firebase
  firebase.initializeApp(firebaseConfig);
  console.log('[sw.js] Firebase App berhasil diinisialisasi.');

  const messaging = firebase.messaging();
  console.log('[sw.js] Firebase Messaging berhasil diinisialisasi.');

  // 4. Handler untuk notifikasi background
  messaging.onBackgroundMessage((payload) => {
    console.log('[sw.js] Menerima pesan di background:', payload);

    const notificationTitle = payload.notification.title;
    const notificationOptions = {
      body: payload.notification.body,
      icon: payload.notification.icon || '/icons/icon-192x192.png'
    };

    // Menampilkan notifikasi ke pengguna
    self.registration.showNotification(notificationTitle, notificationOptions);
  });

} catch (error) {
  console.error('[sw.js] Terjadi error saat inisialisasi Firebase:', error);
}


// --- Bagian Caching PWA (Tidak perlu diubah) ---
const CACHE_NAME = 'signalmax-cache-v2'; // Versi cache dinaikkan untuk memastikan update
const FILES_TO_CACHE = [
  '/',
  '/index.html',
  '/src/css/style.css',
  '/src/js/main.js',
  '/src/js/router.js',
  '/src/js/ui.js',
  '/src/js/api.js',
  '/src/js/auth.js',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[ServiceWorker] Pre-caching file untuk offline');
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
          console.log('[ServiceWorker] Menghapus cache lama', key);
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
      const fetchPromise = fetch(event.request).then(networkResponse => {
        cache.put(event.request, networkResponse.clone());
        return networkResponse;
      });
      return cachedResponse || fetchPromise;
    })
  );
});