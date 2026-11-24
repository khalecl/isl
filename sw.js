// Offline cache for the Story Lab. Change VERSION after editing any file so phones pick up the update.
const VERSION = 'storylab-v2';
const FILES = [
  './', './index.html', './app.js', './data.js', './charts.js', './panels.js', './dashboard.js', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png',
  './vendor/three/three.module.js',
  './vendor/three/addons/exporters/USDZExporter.js',
  './vendor/three/addons/libs/fflate.module.js'
];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request)));
});
