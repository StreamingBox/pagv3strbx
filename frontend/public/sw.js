const VERSION = "strbx-pwa-v4";
const ASSET_CACHE = `${VERSION}-assets`;
const RUNTIME_CACHE = `${VERSION}-runtime`;
const APP_SHELL = ["/", "/offline.html", "/manifest.webmanifest", "/app-icon.svg", "/app-icon-maskable.svg", "/favicon.svg"];

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(ASSET_CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((key) => ![ASSET_CACHE, RUNTIME_CACHE].includes(key)).map((key) => caches.delete(key)))
        ).then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", (event) => {
    const request = event.request;
    const url = new URL(request.url);

    if (request.method !== "GET") return;
    if (url.origin !== self.location.origin) return;
    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/s/")) return;
    if (url.pathname.startsWith("/platform-logos/")) {
        event.respondWith(fetch(request, { cache: "no-store" }));
        return;
    }
    if (
        url.pathname.startsWith("/src/") ||
        url.pathname.startsWith("/@vite") ||
        url.pathname.startsWith("/node_modules/.vite/")
    ) {
        event.respondWith(fetch(request));
        return;
    }

    if (request.mode === "navigate") {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    const copy = response.clone();
                    caches.open(RUNTIME_CACHE).then((cache) => cache.put("/", copy));
                    return response;
                })
                .catch(async () => (await caches.match("/")) || (await caches.match("/offline.html")) || caches.match(request))
        );
        return;
    }

    event.respondWith(
        caches.match(request).then((cached) => {
            if (cached) return cached;
            return fetch(request).then((response) => {
                if (!response || response.status !== 200 || response.type !== "basic") return response;
                const copy = response.clone();
                caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
                return response;
            });
        })
    );
});
