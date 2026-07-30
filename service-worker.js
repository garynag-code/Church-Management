// Offline-first caching for the PWA shell. Free, no backend required.
const CACHE = "egc-connect-v3";
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
  // Network-first for cross-origin (e.g. Supabase); cache-first for app shell.
  if (new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.match(req).then(cached => cached || fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
      return res;
    }).catch(() => cached))
  );
});
