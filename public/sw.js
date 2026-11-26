const CACHE_NAME = 'lifecare-cache-v5';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/css/style.css?v=20261127b',
  '/js/i18n.js?v=20261127b',
  '/js/i18n-auto.js?v=20261127b',
  '/js/app.js?v=20261127b',
  '/js/planning-ui.js?v=20261127b',
  '/manifest.json',
  '/icons/icon-192.svg',
  '/icons/icon-512.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Let API requests go directly to network
  if (event.request.url.includes('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response(JSON.stringify({ error: 'You are currently offline. Cached operations will sync when back online.' }), {
          headers: { 'Content-Type': 'application/json' },
          status: 503
        });
      })
    );
    return;
  }

  // Network-first strategy for dynamic assets
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const cloned = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          return cachedResponse || caches.match('/index.html');
        });
      })
  );
});
