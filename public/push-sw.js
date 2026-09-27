/**
 * معالج الإشعارات الفورية داخل العامل الخدمي (يُستورد بـ importScripts من sw.js).
 * يُظهر إشعار جوال عربيًا RTL عند وصول تعديل من مسؤول المضخة، ويفتح التطبيق عند اللمس.
 */
/* eslint-env serviceworker */

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "تنظيم المضخات", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "تنظيم المضخات";
  const options = {
    body: data.body || "",
    dir: "rtl",
    lang: "ar",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: data.tag || undefined,
    renotify: data.tag ? true : false,
    data: { url: data.url || "/" },
    requireInteraction: data.level === "danger",
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if ("focus" in client) {
          try {
            await client.focus();
          } catch {
            /* ignore */
          }
          return;
        }
      }
      if (self.clients.openWindow) await self.clients.openWindow(url);
    })()
  );
});
