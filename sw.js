// Offline support. Network first, so an online visit always gets the latest files; the cache is
// only used when the network fails. Keep VERSION in step with the ?v= numbers in index.html.
const VERSION = 5;
const CACHE = `slow-week-${VERSION}`;
const ASSETS = [
  './',
  `style.css?v=${VERSION}`,
  `app.js?v=${VERSION}`,
  'manifest.webmanifest',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(async () => {
        // Pages such as ?demo fall back to the cached app shell.
        const hit = await caches.match(req);
        if (hit) return hit;
        if (req.mode === 'navigate') return caches.match('./');
        return Response.error();
      }),
  );
});
