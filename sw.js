/* PrepSpace service worker: full offline support */
const V='prepspace-v1';
const CORE=['./','./index.html','./manifest.webmanifest','./icon.png','./icon-192.png','./icon-512.png','./icon-maskable-512.png','./apple-touch-icon.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==V).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
 const r=e.request;if(r.method!=='GET')return;
 const u=new URL(r.url);
 /* never cache Firebase/Google API calls (login + sync need the network) */
 if(/googleapis\.com$/.test(u.hostname)&&!/fonts\./.test(u.hostname)||/firestore|identitytoolkit|securetoken|firebaseapp\.com$/.test(u.hostname))return;
 if(r.mode==='navigate'){
  e.respondWith(fetch(r).then(x=>{const c=x.clone();caches.open(V).then(k=>k.put('./index.html',c));return x}).catch(()=>caches.match('./index.html')));return}
 e.respondWith(caches.match(r).then(h=>{
  const n=fetch(r).then(x=>{if(x&&(x.ok||x.type==='opaque')){const c=x.clone();caches.open(V).then(k=>k.put(r,c))}return x}).catch(()=>h);
  return h||n}))});
