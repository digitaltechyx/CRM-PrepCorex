import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Legacy backup poller — DISABLED.
 *
 * Personal-task reminders are delivered via Cloud Tasks
 * (POST /api/tasks/reminders/fire). Collection-group scans of
 * personalTasks were a major Firestore cost driver and must not run
 * on a schedule.
 *
 * Keep this route as a cheap authenticated health stub so old cron
 * callers do not 404 / retry aggressively.
 */
function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    mode: "disabled",
    message:
      "Collection-group reminder polling is disabled. Use Cloud Tasks → /api/tasks/reminders/fire.",
    at: new Date().toISOString(),
  });
}
