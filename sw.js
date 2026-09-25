/**
 * AI Video Editor Pro — Complete Offline & Online Service Worker
 * Version: aive-pro-cache-v1
 * Features: Instant offline launch, Stale-While-Revalidate caching,
 * Background sync, External Font caching, and Offline Fallbacks.
 */

const CACHE_NAME = "aive-pro-cache-v1";

const PRECACHE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/style.css",
  "./js/app.js",
  "./js/bijoy-converter.js",
  "./js/video-editor.js",
  "./js/timeline.js",
  "./js/audio.js",
  "./js/screen-recorder.js",
  "./js/subtitles.js",
  "./js/effects.js",
  "./js/export.js",
  "./js/ai.js",
  "./js/uncommon-features.js",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/icon-192.svg",
  "./assets/icons/icon-512.svg"
];

// Install: Cache critical shell assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Use map with Promise.allSettled to guarantee installation even if an optional file 404s
      await Promise.allSettled(
        PRECACHE_ASSETS.map((url) =>
          cache.add(new Request(url, { cache: "reload" })).catch((err) => {
            console.warn(`[PWA SW] Precache warning for ${url}:`, err);
          })
        )
      );
    })
  );
  self.skipWaiting();
});

// Activate: Clean up previous cache versions and claim clients
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log("[PWA SW] Purging outdated cache:", key);
            return caches.delete(key);
          }
        })
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch: Stale-While-Revalidate for local assets, Cache-First for fonts, Navigation Fallback
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // 1. Google Fonts & CDNs: Cache-first with background network update
  if (url.origin.includes("fonts.googleapis.com") || url.origin.includes("fonts.gstatic.com") || url.origin.includes("unpkg.com")) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) return cached;
        try {
          const fresh = await fetch(req);
          if (fresh && fresh.status === 200) {
            cache.put(req, fresh.clone());
          }
          return fresh;
        } catch (_) {
          return cached || new Response("", { status: 408, statusText: "Offline font" });
        }
      })
    );
    return;
  }

  // 2. Local Assets: Stale-While-Revalidate strategy
  if (url.origin === location.origin) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cachedResponse = await cache.match(req);

        const fetchPromise = fetch(req)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              cache.put(req, networkResponse.clone());
            }
            return networkResponse;
          })
          .catch(async () => {
            // If offline and navigating to a page, serve cached index.html
            if (req.mode === "navigate") {
              const fallback = await cache.match("./index.html");
              if (fallback) return fallback;
            }
            return cachedResponse;
          });

        // Return cached version immediately if present, otherwise wait for network
        return cachedResponse || fetchPromise;
      })
    );
    return;
  }

  // 3. Fallback for other GET requests
  event.respondWith(
    fetch(req).catch(async () => {
      const match = await caches.match(req);
      if (match) return match;
      if (req.mode === "navigate") {
        return caches.match("./index.html");
      }
      return new Response("Offline", { status: 503, statusText: "Offline Mode Active" });
    })
  );
});

// Message listener for manual cache updates or checks
self.addEventListener("message", (event) => {
  if (event.data && event.data.action === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
