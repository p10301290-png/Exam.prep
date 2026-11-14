/* PrepSpace service worker: offline-first app shell. Bump VERSION on every release. */
const VERSION = 'prepspace-v1';
const CORE = ['./', './index.html', './manifest.webmanifest', './icon.png', './icon-192.png', './icon-512.png'];
const SDK = 'https://www.gstatic.com/firebasejs/10.14.1/';
const OPTIONAL = [SDK + 'firebase-app.js', SDK + 'firebase-auth.js', SDK + 'firebase-firestore.js'];
const LIVE = /(firestore|identitytoolkit|securetoken)\.googleapis\.com|apis\.google\.com|\.firebaseapp\.com|accounts\.google\.com/;

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    await c.addAll(CORE);
    await Promise.all(OPTIONAL.map(u => c.add(u).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || LIVE.test(url.hostname) || !/^https?:$/.test(url.protocol)) return;

  if (req.mode === 'navigate') {
    // Network first so updates arrive when online; cached shell when offline.
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok) (await caches.open(VERSION)).put('./index.html', res.clone());
        return res;
      } catch (_) {
        return (await caches.match('./index.html')) || (await caches.match('./')) || Response.error();
      }
    })());
    return;
  }

  // Everything else (own files, fonts, Firebase SDK): cache first, refresh in background.
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const hit = await cache.match(req);
    const net = fetch(req).then(res => {
      if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
      return res;
    }).catch(() => null);
    return hit || (await net) || Response.error();
  })());
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (all.length) return all[0].focus();
    return self.clients.openWindow('./');
  })());
});
