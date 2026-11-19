const CACHE = "fcms-static-v2-mime";
const SHELL = [
  "/offline.html",
  "/icons/crest.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/manifest.webmanifest",
];
self.addEventListener("install", (event) =>
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  ),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("fcms-static-") && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  ),
);
self.addEventListener("fetch", (event) => {
  const request = event.request,
    url = new URL(request.url);
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api") ||
    url.pathname.startsWith("/auth")
  )
    return;
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("/offline.html")),
    );
    return;
  }
  if (
    !SHELL.includes(url.pathname) &&
    !/^\/assets\/[a-zA-Z0-9_.-]+\.(js|css|woff2)$/.test(url.pathname)
  )
    return;
  event.respondWith(
    caches.match(request).then(
      (hit) =>
        (hit && validAssetResponse(url.pathname, hit) ? hit : null) ||
        fetch(request).then((response) => {
          if (response.ok && response.type === "basic" && validAssetResponse(url.pathname, response)) {
            const copy = response.clone();
            event.waitUntil(
              caches.open(CACHE).then((cache) => cache.put(request, copy)),
            );
          }
          return response;
        }),
    ),
  );
});

function validAssetResponse(path, response) {
  const mime = response.headers.get('content-type') || '';
  if (path.endsWith('.js')) return /(?:javascript|ecmascript)/i.test(mime);
  if (path.endsWith('.css')) return /text\/css/i.test(mime);
  if (path.endsWith('.woff2')) return /(?:font\/woff2|application\/font-woff)/i.test(mime);
  return true;
}
