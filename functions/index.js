const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp();
}

const TZ_NEW_JERSEY = "America/New_York";
const CRM_ORIGIN = "https://crm.prepservicesfba.com";

/**
 * Lexi CRM automation every 3 hours.
 * Calls CRM /api/lexi/cron (Vercel Hobby cannot run sub-daily crons).
 *
 * Env (functions/.env at deploy time, or Cloud Functions env):
 *   CRON_SECRET or LEXI_CRON_SECRET
 *   LEXI_CRON_URL (optional) — default https://crm.prepservicesfba.com/api/lexi/cron
 */
exports.runCrmLexiCron = functions
  .runWith({ timeoutSeconds: 120, memory: "256MB" })
  .pubsub.schedule("every 3 hours")
  .timeZone(TZ_NEW_JERSEY)
  .onRun(async () => {
    const url = String(
      process.env.LEXI_CRON_URL || "https://crm.prepservicesfba.com/api/lexi/cron"
    ).trim();
    const secret = String(
      process.env.CRON_SECRET || process.env.LEXI_CRON_SECRET || ""
    ).trim();

    if (!secret) {
      console.warn(
        "[CRM Lexi cron] CRON_SECRET / LEXI_CRON_SECRET not set; skipping."
      );
      return null;
    }

    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${secret}`,
        "x-cron-secret": secret,
      },
    });
    const body = await res.text();
    if (!res.ok) {
      console.error("[CRM Lexi cron] HTTP", res.status, body.slice(0, 800));
      throw new Error(`CRM Lexi cron failed with HTTP ${res.status}`);
    }
    console.log("[CRM Lexi cron] ok", body.slice(0, 800));
    return null;
  });

/**
 * Personal CRM task reminders every minute.
 *
 * Runs in Firebase/Google Cloud Scheduler so Vercel Hobby does not need a
 * sub-daily cron. Tasks remain private under:
 *   users/{uid}/personalTasks/{taskId}
 * Device tokens remain under:
 *   users/{uid}/pushTokens/{tokenHash}
 */
exports.sendCrmTaskReminders = functions
  .runWith({ timeoutSeconds: 120, memory: "256MB" })
  .pubsub.schedule("every 1 minutes")
  .timeZone(TZ_NEW_JERSEY)
  .onRun(async () => {
    const db = admin.firestore();
    const now = new Date();
    const nowIso = now.toISOString();
    const pending = await db
      .collectionGroup("personalTasks")
      .where("notificationPending", "==", true)
      .limit(500)
      .get();

    let sentTasks = 0;
    let sentDevices = 0;
    let skipped = 0;
    const errors = [];

    for (const taskDoc of pending.docs) {
      const task = taskDoc.data() || {};
      const status = String(task.status || "todo");
      const reminderRaw = String(task.reminderAt || task.dueAt || "");
      const reminderAt = reminderRaw ? new Date(reminderRaw) : null;
      if (
        status === "completed" ||
        status === "archived" ||
        !reminderAt ||
        Number.isNaN(reminderAt.getTime()) ||
        reminderAt.getTime() > now.getTime()
      ) {
        skipped += 1;
        continue;
      }

      // Claim the reminder briefly so overlapping scheduler invocations cannot
      // send the same notification twice.
      const claimed = await db.runTransaction(async (transaction) => {
        const fresh = await transaction.get(taskDoc.ref);
        const data = fresh.data() || {};
        if (!fresh.exists || data.notificationPending !== true) return false;
        const priorClaim = data.deliveryClaimedAt
          ? new Date(String(data.deliveryClaimedAt)).getTime()
          : 0;
        if (priorClaim && now.getTime() - priorClaim < 5 * 60 * 1000) return false;
        transaction.update(taskDoc.ref, {
          deliveryClaimedAt: nowIso,
          updatedAt: nowIso,
        });
        return true;
      });
      if (!claimed) {
        skipped += 1;
        continue;
      }

      const userRef = taskDoc.ref.parent.parent;
      if (!userRef) {
        await taskDoc.ref.update({ deliveryClaimedAt: null });
        skipped += 1;
        continue;
      }

      const tokenSnapshot = await userRef
        .collection("pushTokens")
        .where("active", "==", true)
        .get();
      const tokenDocs = tokenSnapshot.docs.filter((item) =>
        Boolean(item.data() && item.data().token)
      );
      const tokens = tokenDocs.map((item) => String(item.data().token));
      if (!tokens.length) {
        await taskDoc.ref.update({ deliveryClaimedAt: null });
        skipped += 1;
        continue;
      }

      try {
        const taskId = taskDoc.id;
        const title = String(task.title || "Personal task");
        const body = String(task.notes || "Your task is due now.").slice(0, 180);
        const taskUrl = `${CRM_ORIGIN}/dashboard/tasks?task=${encodeURIComponent(taskId)}`;
        // Data + webpush notification so closed browsers still show a system
        // alert via FCM, while open CRM tabs receive onMessage/onBackgroundMessage.
        const response = await admin.messaging().sendEachForMulticast({
          tokens,
          data: {
            taskId,
            title: `Due now: ${title}`,
            body,
            priority: String(task.priority || "normal"),
            url: taskUrl,
          },
          webpush: {
            headers: {
              Urgency: "high",
              TTL: "120",
            },
            notification: {
              title: `Due now: ${title}`,
              body,
              icon: `${CRM_ORIGIN}/PCX%20Testing-11.svg`,
              badge: `${CRM_ORIGIN}/PCX%20Testing-11.svg`,
              tag: `crm-task-${taskId}`,
              requireInteraction: task.priority === "urgent",
              actions: [
                { action: "open", title: "Open" },
                { action: "complete", title: "Complete" },
              ],
              data: { taskId, url: taskUrl },
            },
            fcmOptions: { link: taskUrl },
          },
        });

        const invalidCodes = new Set([
          "messaging/registration-token-not-registered",
          "messaging/invalid-registration-token",
          "messaging/invalid-argument",
        ]);
        await Promise.all(
          response.responses.map((result, index) => {
            if (!result.success && invalidCodes.has(result.error && result.error.code)) {
              return tokenDocs[index].ref.delete();
            }
            return Promise.resolve();
          })
        );

        if (response.successCount > 0) {
          await taskDoc.ref.update({
            notificationPending: false,
            reminderSentAt: nowIso,
            deliveryClaimedAt: null,
            updatedAt: nowIso,
          });
          sentTasks += 1;
          sentDevices += response.successCount;
        } else {
          await taskDoc.ref.update({ deliveryClaimedAt: null });
        }
        if (response.failureCount) {
          errors.push(`${taskId}: ${response.failureCount} device failure(s)`);
        }
      } catch (error) {
        await taskDoc.ref.update({ deliveryClaimedAt: null }).catch(() => undefined);
        errors.push(
          `${taskDoc.id}: ${error instanceof Error ? error.message : "unknown delivery error"}`
        );
      }
    }

    console.log("[CRM task reminders]", {
      checked: pending.size,
      sentTasks,
      sentDevices,
      skipped,
      errors: errors.slice(0, 20),
      at: nowIso,
    });
    return null;
  });
