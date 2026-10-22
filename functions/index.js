const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");

admin.initializeApp();

const TZ_NEW_JERSEY = "America/New_York";

/**
 * Lexi CRM automation every 3 hours.
 * Calls this CRM app's /api/lexi/cron (Vercel Hobby cannot run sub-daily crons).
 *
 * Firebase Functions env (same project as PrepCorex / StockFlow):
 *   CRON_SECRET or LEXI_CRON_SECRET  — must match CRM Vercel CRON_SECRET
 *   LEXI_CRON_URL (optional)         — default https://crm.prepservicesfba.com/api/lexi/cron
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
