// Offline cache. Bump VERSION on every release so installed apps pick up the update.
const VERSION = 'hls-0.6.2';
const ASSETS = ['./', './index.html', './app.css', './report.css', './vendor/paged-0.4.3.min.js', './manifest.webmanifest', './vendor/jszip-3.10.1.min.js',
  './vendor/preact-10.24.3.module.js', './vendor/preact-hooks-10.24.3.module.js', './vendor/htm-3.1.1.module.js',
  './src/app.js', './src/model.js', './src/ui/fields.js', './src/ui/room.js', './src/ui/report.js',
  './src/engine/v125.js', './src/engine/psychro.js', './src/ui/psychart.js', './src/engine/ashrae.js', './src/engine/solar.js', './src/engine/conduction.js', './src/engine/rts.js', './src/engine/people.js', './src/engine/compare.js', './src/ui/ashrae-ui.js', './src/data/climate.js', './src/data/tables.js', './src/export/excel.js', './src/data/fromMaster.js', './src/store.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png', './icons/apple-touch-icon.png'];
// activate a new release right away instead of waiting for every tab to close
self.addEventListener('install', (e) => e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });
// network first (always the latest release when online), cache as offline fallback
self.addEventListener('fetch', (e) => {
  const req = e.request; if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  const key = req.mode === 'navigate' ? './index.html' : req;
  // no-cache = revalidate with GitHub Pages (ETag), so a new release shows on the next load instead of after 10 min
  e.respondWith(fetch(req, { cache: 'no-cache' }).then((r) => { if (r.ok) { const cp = r.clone(); caches.open(VERSION).then((c) => c.put(key, cp)); } return r; })
    .catch(() => caches.match(key)));
});
