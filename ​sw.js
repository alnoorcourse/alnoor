/* Al-Noor native Web Push service worker.
 * Does not cache private pages, inbox messages, or credentials.
 */
"use strict";

const DEFAULT_BADGE_PATH = "./icons/badge.png";
const DEFAULT_ICON_PATH = "./icons/icon-192.png";
const INBOX_PAGE_PATH = "./inbox.html";
const INDEX_INBOX_HASH = "./index.html#inbox";
const LECTURE_HASH_PREFIX = "#zoom-alnoor";

function resolveSafeUrl(relativeOrUrl, fallbackPath) {
  const base = self.location.href;
  try {
    const candidate = new URL(String(relativeOrUrl || fallbackPath), base);
    if (candidate.origin !== self.location.origin) {
      return new URL(fallbackPath, base).href;
    }
    return candidate.href;
  } catch (e) {
    return new URL(fallbackPath, base).href;
  }
}

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    payload = { body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "منصة النور";
  const body = payload.body || "لديك رسالة جديدة في صندوق الرسائل.";
  const targetUrl = resolveSafeUrl(payload.url, INDEX_INBOX_HASH);

  const options = {
    body,
    icon: resolveSafeUrl(payload.icon, DEFAULT_ICON_PATH),
    badge: resolveSafeUrl(payload.badge, DEFAULT_BADGE_PATH),
    data: { url: targetUrl }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const rawUrl = event.notification.data?.url || INDEX_INBOX_HASH;
  const targetUrl = resolveSafeUrl(rawUrl, INDEX_INBOX_HASH);

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(targetUrl).catch(() => {});
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
