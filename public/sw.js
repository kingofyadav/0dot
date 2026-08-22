// phase-15 spec §5.2: read-time caching only — previously-viewed content
// stays available offline via standard service-worker caching. Deliberately
// does NOT queue writes made while offline (POSTs, form submissions) for
// later replay; §5.2 explicitly scopes that out of v1 given the unresolved
// conflict-handling/duplicate-submission design questions it raises.
const CACHE_NAME = "0dot-cache-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  // Only GET is safe to cache/replay — a queued POST/PUT/DELETE without a
  // real conflict-resolution design is exactly what §5.2 defers.
  if (request.method !== "GET") return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || Response.error()))
  );
});
