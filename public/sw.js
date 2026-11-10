// Authenticated documents and APIs are never cached by the service worker.
self.addEventListener('install',event=>{self.skipWaiting();event.waitUntil(caches.open('clearspace-v1').then(c=>c.addAll(['/icon.svg'])));});
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{if(new URL(event.request.url).pathname==='/icon.svg')event.respondWith(caches.match(event.request).then(r=>r||fetch(event.request)));});
