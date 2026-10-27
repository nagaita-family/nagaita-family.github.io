/* Network-first local shell. External Firebase modules cache after first successful load. */
const CACHE='family-safety-firebase-20261027-v2';
const ASSETS=['./','./index.html','./app.js','./firebase-config.js','./firebase-client.js','./icon.svg','./manifest.webmanifest'];
self.addEventListener('install',event=>{
 event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
 event.waitUntil(caches.keys().then(names=>Promise.all(names.filter(name=>name.startsWith('family-safety-')&&name!==CACHE).map(name=>caches.delete(name)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET')return;
 const firebaseModule=url.origin==='https://www.gstatic.com'&&url.pathname.startsWith('/firebasejs/13.1.0/');
 if(!firebaseModule&&url.origin!==self.location.origin)return;
 if(firebaseModule){
   event.respondWith(caches.match(request).then(hit=>hit||fetch(request).then(response=>{
     if(response.ok)caches.open(CACHE).then(cache=>cache.put(request,response.clone()));
     return response;
   })));
   return;
 }
 event.respondWith(fetch(request).then(response=>{
   if(response.ok)caches.open(CACHE).then(cache=>cache.put(request,response.clone()));
   return response;
 }).catch(()=>caches.match(request)));
});
