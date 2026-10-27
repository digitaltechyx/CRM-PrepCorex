"use client";

import {
  deleteToken,
  getMessaging,
  getToken,
  isSupported,
  onMessage,
  type Messaging,
} from "firebase/messaging";
import { app } from "@/lib/firebase";

const TOKEN_STORAGE_KEY = "crm-push-token";
const REGISTERED_FLAG_KEY = "crm-push-registered";

async function getServiceWorkerRegistration(): Promise<ServiceWorkerRegistration> {
  if (!("serviceWorker" in navigator)) {
    throw new Error("This browser does not support background notifications.");
  }
  const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;
  return registration;
}

function getClientMessaging(): Messaging {
  return getMessaging(app);
}

export function hasCrmPushDeviceRegistered(): boolean {
  if (typeof window === "undefined") return false;
  return (
    localStorage.getItem(REGISTERED_FLAG_KEY) === "1" &&
    Boolean(localStorage.getItem(TOKEN_STORAGE_KEY))
  );
}

export function vapidKeyConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY?.trim());
}

export async function enableCrmPushNotifications(idToken: string): Promise<string> {
  if (!("Notification" in window)) {
    throw new Error("This browser does not support notifications.");
  }
  if (!(await isSupported())) {
    throw new Error("Push notifications are not supported on this browser.");
  }

  const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY?.trim();
  if (!vapidKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_FIREBASE_VAPID_KEY. Add the Web Push certificate key from Firebase Console → Project settings → Cloud Messaging, then redeploy."
    );
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notification permission was not granted.");
  }

  const serviceWorkerRegistration = await getServiceWorkerRegistration();
  const messaging = getClientMessaging();
  const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration });
  if (!token) throw new Error("Firebase did not return a device token.");

  const response = await fetch("/api/tasks/push-token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      token,
      userAgent: navigator.userAgent,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Could not register this device.");
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
  localStorage.setItem(REGISTERED_FLAG_KEY, "1");
  return token;
}

export async function disableCrmPushNotifications(idToken: string): Promise<void> {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY);
  if (token) {
    await fetch("/api/tasks/push-token", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ token }),
    }).catch(() => undefined);
  }
  if (await isSupported()) {
    await deleteToken(getClientMessaging()).catch(() => false);
  }
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  localStorage.removeItem(REGISTERED_FLAG_KEY);
}

export function currentNotificationPermission(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

/** Foreground FCM handler — shows a system notification while CRM is open. */
export async function listenForCrmForegroundMessages(
  onReminder?: (payload: { title: string; body: string; taskId?: string; url?: string }) => void
): Promise<() => void> {
  if (!(await isSupported())) return () => undefined;
  const messaging = getClientMessaging();
  return onMessage(messaging, (payload) => {
    const data = payload.data || {};
    const notification = payload.notification || {};
    const title = notification.title || data.title || "Task due now";
    const body =
      notification.body || data.body || "Open PrepCorex CRM to view your task.";
    const taskId = data.taskId;
    const url = data.url || (taskId ? `/dashboard/tasks?task=${taskId}` : "/dashboard/tasks");
    onReminder?.({ title, body, taskId, url });
    if (Notification.permission === "granted") {
      void navigator.serviceWorker.ready
        .then((registration) =>
          registration.showNotification(title, {
            body,
            icon: "/PCX%20Testing-11.svg",
            badge: "/PCX%20Testing-11.svg",
            tag: taskId ? `crm-task-${taskId}` : "crm-task-reminder",
            data: { url, taskId },
          })
        )
        .catch(() => undefined);
    }
  });
}
