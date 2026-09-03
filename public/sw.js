/* Kodable Creator Rig service worker: app shell offline, everything else network first.
   Scope is the folder the rig is served from (GitHub Pages: /CreatorRig/). */
const VERSION = 'rig-v1';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  // Hashed build assets are immutable: cache first. Everything else: network first, cache fallback.
  const immutable = /\/assets\/[^/]+-[A-Za-z0-9_-]{8}\.(js|css|wasm)$/.test(req.url);
  event.respondWith(
    immutable
      ? caches.match(req).then((hit) => hit ?? fetch(req).then((res) => put(req, res)))
      : fetch(req)
          .then((res) => put(req, res))
          .catch(() => caches.match(req).then((hit) => hit ?? caches.match('./index.html'))),
  );
});

function put(req, res) {
  if (res.ok) {
    const copy = res.clone();
    caches.open(VERSION).then((cache) => cache.put(req, copy));
  }
  return res;
}
