const CACHE = "u14-live-v1";
const ASSETS = [
    "./",
    "./index.html",
    "./live.html",
    "./export.html",
    "./app.js",
    "./manifest.webmanifest",
    "./data/players.json"
];

self.addEventListener("install", (e) => {
    e.waitUntil(
        caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", (e) => {
    e.waitUntil(
        caches.keys().then(keys => Promise.all(keys.map(k => (k === CACHE ? null : caches.delete(k)))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", (e) => {
    e.respondWith(
        caches.match(e.request).then((r) => r || fetch(e.request).then((resp) => {
            const copy = resp.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(()=>{});
            return resp;
        }).catch(() => caches.match("./index.html")))
    );
});