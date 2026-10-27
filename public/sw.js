const CACHE_NAME = "prepcorex-crm-shell-v1";
const APP_SHELL = ["/dashboard", "/dashboard/tasks", "/PCX%20Testing-11.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch(() => undefined)
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || !event.request.url.startsWith(self.location.origin)) return;
  event.respondWith(
    fetch(event.request).catch(() =>
      caches.match(event.request).then((cached) => cached || caches.match("/dashboard"))
    )
  );
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { notification: { title: "PrepCorex reminder", body: event.data?.text() } };
  }
  const notification = payload.notification || {};
  const data = { ...(payload.data || {}), ...(notification.data || {}) };
  const taskId = data.taskId || "";
  event.waitUntil(
    self.registration.showNotification(
      notification.title || data.title || "Task due now",
      {
        body: notification.body || data.body || "Open PrepCorex CRM to view your task.",
        icon: "/PCX%20Testing-11.svg",
        badge: "/PCX%20Testing-11.svg",
        tag: taskId ? `crm-task-${taskId}` : "crm-task-reminder",
        requireInteraction: data.priority === "urgent",
        data: {
          url: data.url || (taskId ? `/dashboard/tasks?task=${taskId}` : "/dashboard/tasks"),
          taskId,
        },
        actions: taskId
          ? [
              { action: "open", title: "Open" },
              { action: "complete", title: "Complete" },
            ]
          : [{ action: "open", title: "Open" }],
      }
    )
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const taskId = event.notification.data?.taskId || "";
  const url =
    event.action === "complete" && taskId
      ? `/dashboard/tasks?complete=${encodeURIComponent(taskId)}`
      : event.notification.data?.url || "/dashboard/tasks";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});

