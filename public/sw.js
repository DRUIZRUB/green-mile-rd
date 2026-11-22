/* Green Mile RD — Service Worker (PWA Shell + Network-First Freshness) */
const CACHE_NAME = 'green-mile-rd-v6';
const CORE_ASSETS = [
  './',
  './index.html',
  './contrato.html',
  './tracking.html',
  './css/tracking.css?v=20261122-6',
  './css/equipo.css?v=20261122-6',
  './js/catalog-data.js?v=20261122-6',
  './js/firebase-config.js?v=20261122-6',
  './js/geo-map.js?v=20261122-6',
  './js/native-bridge.js?v=20261122-6',
  './js/contrato-page.js?v=20261122-6',
  './js/tracking-page.js?v=20261122-6',
  './logo.png?v=20261122-6',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Never intercept Firebase, OSRM, Nominatim, or map tiles — always go straight to network
  if (
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/__/')
  ) {
    return;
  }

  // Network-first so app updates deploy cleanly, falling back to cache offline
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html')))
  );
});
