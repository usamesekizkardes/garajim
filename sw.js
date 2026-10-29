/* Garajım service worker: uygulamayı çevrimdışı açar. Kayıtların IndexedDB'de, burada değil. */
var V='garajim-v7',SHELL=['pdf.min.js','pdf.worker.min.js','./','index.html','local.js','manifest.webmanifest','icon-192.png','icon-512.png','icon-maskable.png','favicon.ico'];
self.addEventListener('install',function(e){e.waitUntil(caches.open(V).then(function(c){return c.addAll(SHELL)}).then(function(){return self.skipWaiting()}))});
self.addEventListener('activate',function(e){e.waitUntil(caches.keys().then(function(ks){return Promise.all(ks.filter(function(k){return k!==V&&k.indexOf('garajim-')===0}).map(function(k){return caches.delete(k)}))}).then(function(){return self.clients.claim()}))});
self.addEventListener('fetch',function(e){var r=e.request;if(r.method!=='GET')return;var u=new URL(r.url);
  if(u.origin===location.origin){ // önce ağ (güncelleme için), yoksa önbellek
    e.respondWith(fetch(r).then(function(res){if(res.ok){var cp=res.clone();caches.open(V).then(function(c){c.put(r,cp)})}return res}).catch(function(){return caches.match(r,{ignoreSearch:true}).then(function(m){return m||(r.mode==='navigate'?caches.match('index.html'):Response.error())})}));return}
  if(/fonts\.(googleapis|gstatic)\.com|cdnjs\.cloudflare\.com/.test(u.host)){ // yazı tipi ve pdf.js: önce önbellek
    e.respondWith(caches.match(r).then(function(m){return m||fetch(r).then(function(res){if(res.ok||res.type==='opaque'){var cp=res.clone();caches.open(V).then(function(c){c.put(r,cp)})}return res})}))}
});
