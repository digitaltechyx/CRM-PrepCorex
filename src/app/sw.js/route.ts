import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Service worker with Firebase Messaging embedded so closed-app / background
 * Web Push can be decrypted and shown. Public Firebase web config only.
 */
export async function GET() {
  const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
  };

  const body = `
/* PrepCorex CRM service worker — PWA shell + FCM background push */
importScripts("https://www.gstatic.com/firebasejs/12.11.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.11.0/firebase-messaging-compat.js");

const CACHE_NAME = "prepcorex-crm-shell-v2";
const APP_SHELL = ["/dashboard", "/dashboard/tasks", "/PCX%20Testing-11.svg"];
const FIREBASE_CONFIG = ${JSON.stringify(firebaseConfig)};

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

function showTaskNotification(payload) {
  const notification = (payload && payload.notification) || {};
  const data = Object.assign({}, (payload && payload.data) || {}, notification.data || {});
  const taskId = data.taskId || "";
  const title = notification.title || data.title || "Task due now";
  const body =
    notification.body || data.body || "Open PrepCorex CRM to view your task.";
  const url =
    data.url || (taskId ? "/dashboard/tasks?task=" + encodeURIComponent(taskId) : "/dashboard/tasks");

  return self.registration.showNotification(title, {
    body,
    icon: "/PCX%20Testing-11.svg",
    badge: "/PCX%20Testing-11.svg",
    tag: taskId ? "crm-task-" + taskId : "crm-task-reminder",
    requireInteraction: data.priority === "urgent",
    data: { url, taskId },
    actions: taskId
      ? [
          { action: "open", title: "Open" },
          { action: "complete", title: "Complete" },
        ]
      : [{ action: "open", title: "Open" }],
  });
}

try {
  if (FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.projectId && firebase) {
    firebase.initializeApp(FIREBASE_CONFIG);
    const messaging = firebase.messaging();
    messaging.onBackgroundMessage((payload) => showTaskNotification(payload || {}));
  }
} catch (error) {
  console.error("[CRM SW] Firebase messaging init failed", error);
}

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_) {
    payload = {
      notification: {
        title: "PrepCorex reminder",
        body: event.data && event.data.text ? event.data.text() : "You have a task due now.",
      },
    };
  }
  // FCM compat often handles this via onBackgroundMessage; this is a fallback
  // for plain Web Push / already-decoded payloads.
  if (payload && (payload.notification || payload.data)) {
    event.waitUntil(showTaskNotification(payload));
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const taskId = (event.notification.data && event.notification.data.taskId) || "";
  const url =
    event.action === "complete" && taskId
      ? "/dashboard/tasks?complete=" + encodeURIComponent(taskId)
      : (event.notification.data && event.notification.data.url) || "/dashboard/tasks";
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
`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Service-Worker-Allowed": "/",
    },
  });
}
