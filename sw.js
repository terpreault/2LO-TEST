/* 2LO V6.0 — étape 6A : coque PWA réellement disponible hors connexion.
   Synchronisation Supabase non mise en cache par le service worker. */
const CACHE = '2lo-v6-0-iphone-test-6051';
const CORE = [
  './', './index.html', './styles.css?v=6051', './app.js?v=6051',
  './config.js?v=6051', './sync.js?v=6051', './notifications.js?v=6051', './manifest.json',
  './icons/icon-192.png', './icons/icon-512.png',
  './icons/icon-1024.png', './icons/apple-touch-icon.png',
  './icons/2LO-wordmark.png',
  './assets/fond-inferno.webp', './assets/fond-toxic.webp',
  './assets/fond-aqua-paradise.webp',
  './assets/logo-2lo-inferno.svg', './assets/logo-2lo-toxic.svg',
  './assets/logo-2lo-aqua.svg'
];

self.addEventListener('install', (event) => {
  // Fail the installation rather than activating an incomplete shell.
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('2lo-') && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // Supabase, analytics and all foreign origins must never enter the PWA shell cache.
  if (url.origin !== self.location.origin) return;

  // Always show the previously cached application if a navigation fails offline.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) return response;
      } catch (_) { /* offline: use the installed shell */ }
      return (await caches.match('./index.html')) ||
             (await caches.match('./')) ||
             new Response('2LO doit être ouverte une première fois avec Internet.', {
               status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
             });
    })());
    return;
  }

  // Public configuration must refresh whenever it changes on GitHub Pages.
  // Keep an offline copy so a previously activated session still works offline.
  if (url.pathname.endsWith('/config.js')) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const response = await fetch(request, {cache:'no-store'});
        if (response.ok) await cache.put(request,response.clone());
        return response;
      } catch (_) { return (await cache.match(request)) || Response.error(); }
    })());
    return;
  }

  // Code, fonts (if added later), icons and the three heavy backgrounds are cache first.
  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok && response.type === 'basic') {
        const cache = await caches.open(CACHE);
        await cache.put(request, response.clone());
      }
      return response;
    } catch (_) {
      return Response.error();
    }
  })());
});

// Cross-platform Web Push: the remote service sends notifications even when the PWA is closed.
self.addEventListener('push', event => {
  event.waitUntil((async()=>{
    let payload={};
    try{payload=event.data?.json()||{};}catch{payload={title:'2LO',body:event.data?.text()||'Tu as une nouvelle notification.'};}
    const title=String(payload.title||'2LO').slice(0,100);
    const body=String(payload.body||'').slice(0,300);
    await self.registration.showNotification(title,{
      body, icon:'./icons/icon-192.png', badge:'./icons/icon-192.png',
      tag:String(payload.tag||'2lo-notification').slice(0,60),renotify:false,
      data:{url:new URL('./',self.registration.scope).href}
    });
  })());
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  event.waitUntil((async()=>{
    const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const target=self.registration.scope;
    for(const client of clients){if(client.url.startsWith(target)){await client.focus();return;}}
    await self.clients.openWindow(target);
  })());
});
