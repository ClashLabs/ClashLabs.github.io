/* ClashLabs service worker — makes the site installable and work offline.
   App shell: stale-while-revalidate. Data JSON: network-first (fresh when online,
   cached fallback offline). Cross-origin (card art CDN, lookup Worker) is never
   intercepted — it goes straight to the network. */
'use strict';
const CACHE = 'clashlabs-v1';
const SHELL = [
  './', 'index.html', 'styles.css', 'app.js', 'deckbuilder.js', 'tour.js',
  'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()).catch(() => {}));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;          // API + card CDN go straight to network

  const isData = url.pathname.endsWith('.json');
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (isData) {
      try {
        const res = await fetch(req);
        if (res && res.status === 200) cache.put(req, res.clone());
        return res;
      } catch (_) {
        const cached = await cache.match(req);
        if (cached) return cached;
        throw _;
      }
    }
    const cached = await cache.match(req);
    const net = fetch(req).then(res => { if (res && res.status === 200) cache.put(req, res.clone()); return res; })
      .catch(() => cached);
    return cached || net;
  })());
});
