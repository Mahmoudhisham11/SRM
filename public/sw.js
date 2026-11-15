// SRM Voice Log — Service Worker for PWA (registered in production builds only).
// Bump CACHE_VERSION when this file's caching rules change: the old cache is
// deleted on activate. App code needs no bump — pages are network-first and
// /_next/static files have content-hashed names.
const CACHE_VERSION = 2;
const CACHE_NAME = `srm-voice-v${CACHE_VERSION}`;

const PRECACHE_ASSETS = [
  "/",
  "/icon.svg",
  "/icons/icon-192x192.png",
  "/icons/icon-512x512.png",
  "/icons/apple-touch-icon.png",
  "/manifest.webmanifest",
];

// URLs that should NEVER be cached (Firebase Firestore, Auth, Storage APIs)
const BYPASS_URL_PATTERNS = [
  "firestore.googleapis.com",
  "identitytoolkit.googleapis.com",
  "securetoken.googleapis.com",
  "firebaseio.com",
  "firebasestorage.googleapis.com",
  "accounts.google.com",
  "apis.google.com",
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn("[SW] Precache issue:", err);
      });
    })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME) {
              return caches.delete(key);
            }
          })
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Only handle GET requests
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Only this app's own files (and skip chrome-extension:// etc.)
  if (url.origin !== self.location.origin) return;

  // Bypass Firebase & Google Auth API calls entirely
  if (BYPASS_URL_PATTERNS.some((pattern) => url.hostname.includes(pattern))) {
    return;
  }

  // HTML page navigations: Network-first, fallback to cache
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            const clone = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return networkRes;
        })
        .catch(async () => {
          const cachedRes = await caches.match(req);
          if (cachedRes) return cachedRes;
          const rootCached = await caches.match("/");
          return rootCached || Response.error();
        })
    );
    return;
  }

  // Static assets (Next static chunks, images, icons, fonts): Stale-While-Revalidate
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/icon.svg" ||
    url.pathname.match(/\.(png|jpg|jpeg|svg|webp|woff2|woff|ttf|css|js)$/)
  ) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const fetchPromise = fetch(req)
          .then((networkRes) => {
            if (networkRes && networkRes.status === 200) {
              const clone = networkRes.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
            }
            return networkRes;
          })
          .catch(() => cached);

        return cached || fetchPromise;
      })
    );
    return;
  }
});

