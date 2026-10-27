// Service worker: needed so Chrome offers to install Pedala as an app.
// Page loads are left to the browser on purpose, so the login prompt always works;
// only the icons and the manifest are kept in a cache. api/ is never touched.
const CACHE = "pedala-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", e => {
  const r = e.request, u = new URL(r.url);
  if(r.method !== "GET" || u.origin !== location.origin || r.mode === "navigate") return;
  if(!/^\/(manifest\.webmanifest|icons\/)/.test(u.pathname)) return;
  e.respondWith(caches.open(CACHE).then(c => c.match(r).then(hit => hit || fetch(r).then(res => { if(res.ok) c.put(r, res.clone()); return res; }))));
});
