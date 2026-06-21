const CACHE_NAME = 'n1-word-craft-v25';
const ASSETS = [
  './',
  './index.html',
  './style.css?v=25',
  './game.js?v=25',
  './words_data.js?v=25',
  './manifest.json',
  './icon.svg'
];

// Install: pre-cache all assets and activate immediately
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())   // don't wait for old SW to die
  );
});

// Activate: delete old caches and take control of all pages immediately
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((key) => {
        if (key !== CACHE_NAME) return caches.delete(key);
      }))
    ).then(() => self.clients.claim())   // take over open tabs now
  );
});

// Fetch: NETWORK FIRST for app files, fallback to cache when offline
self.addEventListener('fetch', (e) => {
  // Only handle same-origin GET requests
  if (e.request.method !== 'GET') return;

  e.respondWith(
    fetch(e.request)
      .then((networkResponse) => {
        // Got a fresh response — update the cache in the background
        if (networkResponse && networkResponse.status === 200) {
          const cloned = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, cloned));
        }
        return networkResponse;
      })
      .catch(() => {
        // Offline — serve from cache as fallback
        return caches.match(e.request);
      })
  );
});
