// File: sw.js (Service Worker)

const CACHE_NAME = 'signalmax-cache-v1';
// Daftar file inti yang akan disimpan di cache agar aplikasi bisa diakses offline.
const FILES_TO_CACHE = [
  '/',
  '/index.html',
  '/src/css/style.css',
  '/src/js/main.js',
  '/src/js/router.js',
  '/src/js/ui.js',
  '/src/js/api.js',
  '/src/js/auth.js',
  '/src/js/config.template.js', // Cache template-nya
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png'
  // Anda bisa menambahkan file HTML halaman utama di sini jika mau
  // '/src/pages/app/home.html',
  // '/src/pages/app/signals.html',
  // '/src/pages/app/community.html',
];

// Event 'install': Dipicu saat service worker pertama kali diinstal.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[ServiceWorker] Pre-caching offline page');
      return cache.addAll(FILES_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Event 'activate': Dipicu saat service worker aktif.
// Berguna untuk membersihkan cache lama.
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

// Event 'fetch': Dipicu setiap kali ada permintaan jaringan dari aplikasi.
// Ini adalah inti dari fungsionalitas offline.
self.addEventListener('fetch', (event) => {
  // Kita hanya proses request GET
  if (event.request.method !== 'GET') {
    return;
  }
  
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      // 1. Coba cari di cache terlebih dahulu
      const cachedResponse = await cache.match(event.request);
      if (cachedResponse) {
        return cachedResponse;
      }

      // 2. Jika tidak ada di cache, coba ambil dari jaringan
      try {
        const networkResponse = await fetch(event.request);
        // Simpan respons jaringan ke cache untuk penggunaan berikutnya
        event.waitUntil(cache.put(event.request, networkResponse.clone()));
        return networkResponse;
      } catch (error) {
        // Jika jaringan gagal (offline), berikan fallback jika ada
        console.error('[ServiceWorker] Fetch failed; returning offline page if available.', error);
        // Anda bisa memberikan halaman offline kustom di sini
        // const offlinePage = await cache.match('/offline.html');
        // return offlinePage;
      }
    })
  );
});