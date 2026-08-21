/**
 * Service worker for ProgressTracker.
 *
 * Deliberately conservative. Personal data is never cached: a stale weight or
 * calorie total shown as if it were current is worse than an honest offline
 * message, and a shared device must not serve one person's log from cache.
 * What is cached is the shell — the app's own static assets — so the PWA opens
 * and the on-device workout logger works with no connection.
 */

const VERSION = "v1";
const SHELL_CACHE = `shell-${VERSION}`;
const OFFLINE_URL = "/offline";

const SHELL_ASSETS = [
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      // A single missing asset must not fail the whole install.
      .then((cache) => Promise.allSettled(SHELL_ASSETS.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // API responses carry personal data and must always come from the network.
  if (url.pathname.startsWith("/api/")) return;

  // Navigations: network first, falling back to the offline page. The workout
  // logger keeps working from IndexedDB either way.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cached = await caches.match(OFFLINE_URL);
        return (
          cached ??
          new Response("<h1>Offline</h1><p>Reconnect to load this page.</p>", {
            status: 503,
            headers: { "Content-Type": "text/html; charset=utf-8" },
          })
        );
      }),
    );
    return;
  }

  // Static assets: cache first, since Next fingerprints their filenames.
  if (url.pathname.startsWith("/_next/static/") || /\.(png|svg|ico|webmanifest|woff2?)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              void caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
  }
});
