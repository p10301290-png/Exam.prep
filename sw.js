/* PrepSpace service worker — offline-first shell, online-fresh updates.
   Sab paths relative hain, isliye GitHub Pages ke /repo-name/ subpath par bhi chalta hai. */
const VERSION = 'prepspace-v1';
const CORE = VERSION + '-core';
const RUNTIME = VERSION + '-runtime';
const SHELL = ['./manifest.webmanifest', './icon.png', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CORE);
    // index.html zaroori hai: ek hi fetch ko './' aur './index.html' dono keys par save karo
    const res = await fetch('./index.html', { cache: 'reload' });
    if (!res.ok) throw new Error('index.html not available');
    await cache.put('./index.html', res.clone());
    await cache.put('./', res);
    // baaki files best-effort (ek missing icon install ko fail na kare)
    await Promise.allSettled(SHELL.map((u) => cache.add(new Request(u, { cache: 'reload' }))));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

const okToCache = (r) => r && (r.ok || r.type === 'opaque');

// Network-first (timeout ke saath) — online ho to latest, offline/slow ho to cache
async function networkFirstPage(request) {
  const cache = await caches.open(CORE);
  try {
    const res = await Promise.race([
      fetch(request),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 4000)),
    ]);
    if (res && res.ok) { cache.put('./index.html', res.clone()); cache.put('./', res.clone()); }
    return res;
  } catch (e) {
    const hit = (await cache.match('./index.html')) || (await cache.match('./'));
    if (hit) return hit;
    return new Response('<h1>Offline</h1><p>PrepSpace ko pehli baar online khol kar load karein.</p>',
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
}

// Cache turant, saath me background me refresh
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  const net = fetch(request).then((res) => { if (okToCache(res)) cache.put(request, res.clone()); return res; }).catch(() => null);
  if (hit) { net.catch(() => {}); return hit; }
  return (await net) || Response.error();
}

// Immutable files (versioned font/firebase URLs): cache first
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  try {
    const res = await fetch(request);
    if (okToCache(res)) cache.put(request, res.clone());
    return res;
  } catch (e) { return Response.error(); }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (req.mode === 'navigate') { event.respondWith(networkFirstPage(req)); return; }

  if (url.origin === self.location.origin) {
    if (url.pathname.endsWith('/sw.js')) return;
    event.respondWith(staleWhileRevalidate(req, CORE));
    return;
  }
  if (url.hostname === 'fonts.googleapis.com') { event.respondWith(staleWhileRevalidate(req, RUNTIME)); return; }
  if (url.hostname === 'fonts.gstatic.com' ||
      (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/'))) {
    event.respondWith(cacheFirst(req, RUNTIME)); return;
  }
  // Baaki sab (Firestore, Google sign-in etc.) seedha network par — SW beech me nahi aata
});
