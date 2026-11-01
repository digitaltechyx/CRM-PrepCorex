const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const { syncPersonalTaskCloudTasks } = require("./task-reminders-cloud-tasks");

if (!admin.apps.length) {
  admin.initializeApp();
}

const TZ_NEW_JERSEY = "America/New_York";

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
 * Primary reminders: when a personal task is created/updated, schedule
 * exact Cloud Tasks alarms (20 min before, start, end).
 *
 * Env:
 *   CRON_SECRET
 *   CLOUD_TASKS_LOCATION (default us-central1)
 *   CLOUD_TASKS_QUEUE (default crm-task-reminders)
 *   TASK_FIRE_URL (optional) — default https://crm.prepservicesfba.com/api/tasks/reminders/fire
 */
exports.syncCrmTaskReminderCloudTasks = functions
  .runWith({ timeoutSeconds: 60, memory: "256MB" })
  .firestore.document("users/{uid}/personalTasks/{taskId}")
  .onWrite(async (change, context) => {
    try {
      return await syncPersonalTaskCloudTasks(change, context);
    } catch (err) {
      console.error(
        "[Cloud Tasks sync]",
        context.params.taskId,
        err && err.message ? err.message : err
      );
      throw err;
    }
  });

/**
 * sendCrmTaskRemindersBackup was removed (2026-11-02).
 * It called a personalTasks collectionGroup poll and added Firestore cost.
 * Reminders now use Cloud Tasks only → /api/tasks/reminders/fire.
 * Do not re-add a scheduled collectionGroup scanner.
 */
