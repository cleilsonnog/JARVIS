// Service Worker - JARVIS PWA
const CACHE_NAME = "jarvis-v20";
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/app.js",
  "/style.css",
  "/js/tts.js",
  "/js/stt.js",
  "/js/chat.js",
  "/js/sidebar.js",
  "/js/pages.js",
  "/js/upload.js",
  "/js/commands.js",
  "/js/dashboard.js",
  "/js/widgets.js",
  "/js/agenda.js",
  "/js/core.js",
  "/js/integrations.js",
  "/js/verses.js",
  "/data/verses.json",
  "/js/camera.js",
  "/js/widget-page.js",
  "/widget.html",
  "/tailwind.css",
  "/js/theme.js",
  "/js/reminders.js",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/badge-96.png",
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

// ===== Push notifications (reminders) =====
self.addEventListener("push", (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch { data = { text: e.data?.text() }; }

  const isReminder = data.type === "reminder";
  const title = isReminder ? "JARVIS · Lembrete" : "JARVIS";
  const options = {
    body: data.text || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/badge-96.png",
    tag: isReminder ? `reminder-${data.id}` : "jarvis",
    renotify: true,
    requireInteraction: isReminder, // stays until the user acts on it
    vibrate: [200, 100, 200, 100, 400],
    data,
    actions: isReminder
      ? [{ action: "done", title: "Concluir" }, { action: "snooze", title: "Adiar 10 min" }]
      : [],
  };

  e.waitUntil((async () => {
    await self.registration.showNotification(title, options);
    // Open JARVIS tabs show the card and speak right away instead of waiting for their poll
    const tabs = await self.clients.matchAll({ type: "window" });
    tabs.forEach((c) => c.postMessage({ type: "jarvis-push", data }));
  })());
});

self.addEventListener("notificationclick", (e) => {
  const { data } = e.notification;
  e.notification.close();

  e.waitUntil((async () => {
    if (data?.type === "reminder" && (e.action === "done" || e.action === "snooze")) {
      const url = `/api/reminders/${data.id}/${e.action}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minutes: 10 }),
      }).catch(() => null);
      if (res?.ok) {
        const tabs = await self.clients.matchAll({ type: "window" });
        tabs.forEach((c) => c.postMessage({ type: "jarvis-reminder-updated", id: data.id }));
        return;
      }
      // Not logged in / offline: fall through and open the app so the user can act there
    }

    const tabs = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const tab = tabs.find((c) => new URL(c.url).origin === self.location.origin);
    if (tab) return tab.focus();
    return self.clients.openWindow("/");
  })());
});
