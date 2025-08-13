self.addEventListener('install', (e)=>{ self.skipWaiting(); });
self.addEventListener('activate', (e)=>{ e.waitUntil(clients.claim()); });
self.addEventListener('fetch', (e)=>{
  const url = new URL(e.request.url);
  if(url.pathname.includes('/data/')){
    e.respondWith(caches.open('si-data').then(async cache=>{
      const cached = await cache.match(e.request);
      const net = fetch(e.request).then(res=>{ if(res.ok) cache.put(e.request, res.clone()); return res; }).catch(()=>null);
      return (await net) || cached || fetch(e.request);
    }));
  }
});
