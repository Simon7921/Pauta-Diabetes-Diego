// Service worker: red primero (para recibir cambios), caché si no hay internet.
const C="diego-v62-entrada-manual-sin-cero-20261126";
const F=["./","index.html","calc.js","store.js","app.js","manifest.json","icon-180.png","icon-192.png","icon-512.png","player-soft-pastel.webp","ciclista-diego-v59.png","sage-dashboard.css","sage-dashboard.js","ai-photos.js","sensor-reminder.js","bitacora.js","firebase-config.js","diego-familiar.js","diego-ai.js","diego-ai-context.js"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(F)));self.skipWaiting()});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))));self.clients.claim()});
self.addEventListener("fetch",e=>{if(e.request.method!=="GET")return;
 e.respondWith(fetch(e.request).then(r=>{const cp=r.clone();caches.open(C).then(c=>c.put(e.request,cp));return r}).catch(()=>caches.match(e.request,{ignoreSearch:true}).then(m=>m||caches.match("index.html"))))});
