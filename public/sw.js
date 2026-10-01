// Service Worker - JARVIS PWA
const CACHE_NAME = "jarvis-v7";
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/app.js",
  "/style.css",
  "/js/tts.js",
  "/js/stt.js",
  "/js/chat.js",
  "/js/sidebar.js",
  "/js/upload.js",
  "/js/commands.js",
  "/js/dashboard.js",
  "/js/widgets.js",
  "/js/camera.js",
  "/js/widget-page.js",
  "/widget.html",
  "/tailwind.css",
  "/js/theme.js",
  "/js/reminders.js",
  "/manifest.json",
];

self.addEventListener("install", (e) => {
  // Precache only real files: when logged out every asset redirects to the login page,
  // and caching that HTML under "/app.js" etc. would break the app later
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(STATIC_ASSETS.map(async (url) => {
        try {
          const res = await fetch(url, { redirect: "manual" });
          if (res.ok) await cache.put(url, res);
        } catch {}
      }))
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  // API: network only (offline JSON fallback)
  if (e.request.url.includes("/api/")) {
    // 503 (not 200) so callers never mistake "offline" for success
    e.respondWith(fetch(e.request).catch(() => new Response('{"error":"offline"}', { status: 503, headers: { "Content-Type": "application/json" } })));
  } else {
    // Network first so deploys show up immediately; cache is the offline fallback
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          if (res.ok && !res.redirected && e.request.method === "GET") {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(e.request, copy));
          }
          return res;
        })
        .catch(() => caches.match(e.request))
    );
  }
});
