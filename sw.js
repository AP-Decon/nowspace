const CACHE_NAME = 'nowspace-cache-v3';
const urlsToCache = [
  './',
  './index.html',
  './style.css',
  './config.js',
  './media.js',
  './ui.js',
  './network.js'
];

// 1. Install & Force Takeover
self.addEventListener('install', event => {
  self.skipWaiting(); // Forces the browser to immediately activate the new worker
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(urlsToCache);
    })
  );
});

// 2. Network-First Strategy
self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request)
      .then(networkResponse => {
        // If we get a valid response from the internet, clone it to the cache and show it
        return caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, networkResponse.clone());
          return networkResponse;
        });
      })
      .catch(() => {
        // If the network fails (offline), pull from the local cache
        return caches.match(event.request);
      })
  );
});

// 3. Clean up old caches & claim clients instantly
self.addEventListener('activate', event => {
  event.waitUntil(clients.claim()); // Take control of open tabs immediately without reloading
  
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
