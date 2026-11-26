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
  const raw = relativeOrUrl ? String(relativeOrUrl).trim() : "";

  // دعم الروابط المختصرة مثل "inbox" أو "#zoom-alnoor..."
  if (raw === "inbox") {
    return new URL(INDEX_INBOX_HASH, base).href;
  }
  if (raw.startsWith(LECTURE_HASH_PREFIX)) {
    return new URL(`./index.html${raw}`, base).href;
  }

  try {
    const candidate = new URL(raw || fallbackPath, base);
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

  if (event.data) {
    try {
      const parsed = event.data.json();
      payload = parsed && typeof parsed === "object" ? parsed : { body: String(parsed) };
    } catch (e) {
      try {
        payload = { body: event.data.text() };
      } catch (err) {
        payload = {};
      }
    }
  }

  const title = (payload.title && String(payload.title).trim()) || "منصة النور";
  const body = (payload.body && String(payload.body).trim()) || "لديك رسالة جديدة في صندوق الرسائل.";
  const targetUrl = resolveSafeUrl(payload.url, INDEX_INBOX_HASH);

  const options = {
    body,
    icon: resolveSafeUrl(payload.icon, DEFAULT_ICON_PATH),
    badge: resolveSafeUrl(payload.badge, DEFAULT_BADGE_PATH),
    tag: payload.tag ? String(payload.tag) : "alnoor-general",
    renotify: Boolean(payload.renotify),
    data: {
      url: targetUrl,
      inboxPage: resolveSafeUrl(INBOX_PAGE_PATH, INDEX_INBOX_HASH)
    }
  };

  event.waitUntil(
    self.registration.showNotification(title, options).catch((err) => {
      // fallback بدون أيقونات في حال تعذّر تحميل ملف أيقونة على جهاز معيّن
      return self.registration.showNotification(title, {
        body,
        tag: options.tag,
        data: options.data
      });
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const rawUrl = event.notification.data?.url || INDEX_INBOX_HASH;
  const targetUrl = resolveSafeUrl(rawUrl, INDEX_INBOX_HASH);
  const targetObj = new URL(targetUrl);

  event.waitUntil(
    (async () => {
      const windowClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true
      });

      for (const client of windowClients) {
        if (!("focus" in client)) continue;
        try {
          const clientUrl = new URL(client.url);
          await client.focus();

          // إذا كانت نفس الصفحة والفرق في الـ hash فقط
          if (
            clientUrl.origin === targetObj.origin &&
            clientUrl.pathname === targetObj.pathname &&
            targetObj.hash
          ) {
            if ("postMessage" in client) {
              client.postMessage({ type: "ALNOOR_NAVIGATE_HASH", hash: targetObj.hash, url: targetUrl });
            }
          }

          if (client.url !== targetUrl && "navigate" in client) {
            await client.navigate(targetUrl);
          }
          return;
        } catch (e) {
          // جرّب العميل التالي أو افتح نافذة جديدة
        }
      }

      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl);
      }
    })()
  );
});
