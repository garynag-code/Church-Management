// Network-first for the app shell so users always get the latest when online;
// falls back to cache when offline. Free, no backend required.
const CACHE = "egc-connect-v43";
const ASSETS = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./manifest.json",
  "./icons/icon.svg",
  "./icons/logo.jpg",
  "./js/app.js",
  "./js/auth.js",
  "./js/db.js",
  "./js/config.js",
  "./js/notifications.js"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  if (new URL(req.url).origin !== self.location.origin) return; // let cross-origin (e.g. Supabase) pass through
  // Network-first: always fetch the latest when online, cache it, fall back to cache offline.
  e.respondWith(
    fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(req))
  );
});
