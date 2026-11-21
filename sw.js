/* Somar Orden · service worker: la app abre rápido y siempre busca la versión nueva primero. */
const CACHE = 'somar-orden-v2';
const BASE = ['/panel', '/assets/css/app.css?v=2', '/assets/js/core.js?v=2', '/assets/js/panel.js?v=2', '/assets/img/icon.svg', '/assets/img/icon-192.png'];

self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(BASE)).catch(() => { })); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== CACHE).map(x => caches.delete(x))))); self.clients.claim(); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return; // Supabase y demás van directo a la red
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); } return r; })
    .catch(() => caches.match(e.request).then(r => r || caches.match('/panel'))));
});
