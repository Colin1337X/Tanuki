// This worker replaces old versions that cached authenticated data.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const name of await caches.keys())if(name.startsWith('tanuki-'))await caches.delete(name);await self.clients.claim();await self.registration.unregister();})()));
