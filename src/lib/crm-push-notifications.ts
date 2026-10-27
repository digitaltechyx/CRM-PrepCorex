"use client";

import { deleteToken, getMessaging, getToken, isSupported } from "firebase/messaging";
import { app } from "@/lib/firebase";

const TOKEN_STORAGE_KEY = "crm-push-token";

async function getServiceWorkerRegistration(): Promise<ServiceWorkerRegistration> {
  if (!("serviceWorker" in navigator)) {
    throw new Error("This browser does not support background notifications.");
  }
  return navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

export async function enableCrmPushNotifications(idToken: string): Promise<string> {
  if (!("Notification" in window)) {
    throw new Error("This browser does not support notifications.");
  }
  if (!(await isSupported())) {
    throw new Error("Push notifications are not supported on this browser.");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notification permission was not granted.");
  }

  const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY?.trim();
  if (!vapidKey) {
    throw new Error("Push notifications need NEXT_PUBLIC_FIREBASE_VAPID_KEY.");
  }

  const serviceWorkerRegistration = await getServiceWorkerRegistration();
  const messaging = getMessaging(app);
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
    await deleteToken(getMessaging(app)).catch(() => false);
  }
  localStorage.removeItem(TOKEN_STORAGE_KEY);
}

export function currentNotificationPermission(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

