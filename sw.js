// Offline cache. Bump VERSION on every release so installed apps pick up the update.
const VERSION = 'hls-0.2.1';
const ASSETS = ['./', './index.html', './app.css', './manifest.webmanifest', './vendor/jszip-3.10.1.min.js',
  './vendor/preact-10.24.3.module.js', './vendor/preact-hooks-10.24.3.module.js', './vendor/htm-3.1.1.module.js',
  './src/app.js', './src/model.js', './src/ui/fields.js', './src/ui/room.js',
  './src/engine/v125.js', './src/export/excel.js', './src/data/fromMaster.js', './src/store.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png', './icons/apple-touch-icon.png'];
self.addEventListener('install', (e) => e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS))));
self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });
// network first (always the latest release when online), cache as offline fallback
self.addEventListener('fetch', (e) => {
  const req = e.request; if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  const key = req.mode === 'navigate' ? './index.html' : req;
  e.respondWith(fetch(req).then((r) => { if (r.ok) { const cp = r.clone(); caches.open(VERSION).then((c) => c.put(key, cp)); } return r; })
    .catch(() => caches.match(key)));
});
