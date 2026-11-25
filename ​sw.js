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
    if (candidate.origin === self.location.origin) {
      return candidate.href;
    }
  } catch (_) {}
  return new URL(fallbackPath, base).href;
}

function resolveInboxTargetUrl(rawUrl) {
  const fallback = new URL(INBOX_PAGE_PATH, self.location.href);
  if (!rawUrl) return fallback.href;

  try {
    const resolved = new URL(resolveSafeUrl(rawUrl, fallback.href));
    if (resolved.hash === "#inbox" && resolved.pathname.endsWith("/index.html")) {
      return fallback.href;
    }
    return resolved.href;
  } catch (_) {
    return fallback.href;
  }
}

function parsePushPayload(event) {
  if (!event || !event.data) return {};
  try {
    const parsed = event.data.json();
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (_) {
    try {
      const text = String(event.data.text() || "").trim();
      return text ? { body: text } : {};
    } catch (__) {
      return {};
    }
  }
}

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  event.waitUntil((async () => {
    const payload = parsePushPayload(event);
    const rawId = typeof payload.id === "string" && payload.id.trim()
      ? payload.id.trim()
      : `msg-${Date.now()}`;
    const id = rawId.slice(0, 180);
    const tag = `alnoor-${id}`;

    const existing = await self.registration.getNotifications({ tag });
    if (existing && existing.length > 0) return;

    const title = typeof payload.title === "string" && payload.title.trim()
      ? payload.title.trim().slice(0, 120)
      : "منصة النور · رسالة جديدة";

    // Keep lock-screen notification generic so private message text or group links stay protected until inbox opens.
    const body = typeof payload.body === "string" && payload.body.trim()
      ? payload.body.trim().slice(0, 220)
      : "وصلك تحديث في صندوق الرسائل. افتح المنصة لقراءة الرسالة والرابط.";

    const targetUrl = resolveInboxTargetUrl(payload.url);
    const icon = resolveSafeUrl(payload.icon, DEFAULT_ICON_PATH);
    const badge = resolveSafeUrl(payload.badge, DEFAULT_BADGE_PATH);

    await self.registration.showNotification(title, {
      body,
      icon,
      badge,
      tag,
      renotify: false,
      data: {
        id,
        url: targetUrl
      }
    });
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const defaultInboxUrl = new URL(INBOX_PAGE_PATH, self.location.href);
    const indexInboxUrl = new URL(INDEX_INBOX_HASH, self.location.href);
    const requestedUrl = event.notification?.data?.url
      ? new URL(resolveInboxTargetUrl(event.notification.data.url))
      : defaultInboxUrl;

    const clientsList = await self.clients.matchAll({
      type: "window",
      includeUncontrolled: true
    });

    // Reuse an existing platform tab only if it is not currently in an active lecture room.
    const reusableClient = clientsList.find((client) => {
      try {
        const current = new URL(client.url);
        const sameOrigin = current.origin === defaultInboxUrl.origin;
        const isInboxOrIndex =
          current.pathname === defaultInboxUrl.pathname ||
          current.pathname === indexInboxUrl.pathname;
        const inLecture = current.hash.startsWith(LECTURE_HASH_PREFIX);
        return sameOrigin && isInboxOrIndex && !inLecture;
      } catch (_) {
        return false;
      }
    });

    if (reusableClient) {
      if (typeof reusableClient.navigate === "function" && reusableClient.url !== requestedUrl.href) {
        await reusableClient.navigate(requestedUrl.href);
      }
      if (typeof reusableClient.focus === "function") {
        await reusableClient.focus();
      }
      return;
    }

    if (typeof self.clients.openWindow === "function") {
      await self.clients.openWindow(requestedUrl.href);
    }
  })());
});
