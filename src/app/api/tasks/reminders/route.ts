import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { firePersonalTaskReminder } from "@/lib/personal-task-fire";
import type { ReminderPhase } from "@/lib/personal-task-reminders";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Backup poller (rare). Primary delivery is Cloud Tasks → /api/tasks/reminders/fire.
 * Kept for missed/delayed jobs only.
 */
function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

function resolvePhase(task: Record<string, unknown>): ReminderPhase {
  const phase = String(task.reminderPhase || "");
  if (phase === "pre_start" || phase === "start" || phase === "end") return phase;
  return "start";
}

function effectiveFireAt(task: Record<string, unknown>): Date | null {
  const raw = String(task.nextFireAt || task.reminderAt || task.dueAt || "");
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = adminDb();
  const now = new Date();
  const nowIso = now.toISOString();

  let snapshot;
  try {
    snapshot = await db
      .collectionGroup("personalTasks")
      .where("notificationPending", "==", true)
      .where("nextFireAt", "<=", nowIso)
      .orderBy("nextFireAt", "asc")
      .limit(30)
      .get();
  } catch {
    snapshot = await db
      .collectionGroup("personalTasks")
      .where("notificationPending", "==", true)
      .limit(40)
      .get();
  }

  let sentTasks = 0;
  let sentDevices = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const taskDoc of snapshot.docs) {
    const task = taskDoc.data() as Record<string, unknown>;
    const status = String(task.status || "todo");
    const fireAt = effectiveFireAt(task);

    if (status === "completed" || status === "archived" || !fireAt) {
      skipped += 1;
      continue;
    }
    if (fireAt.getTime() > now.getTime()) {
      skipped += 1;
      continue;
    }

    const claimedAt = String(task.deliveryClaimedAt || "");
    const claimedMs = claimedAt ? Date.parse(claimedAt) : 0;
    if (claimedMs && now.getTime() - claimedMs < 4 * 60_000) {
      skipped += 1;
      continue;
    }
    try {
      await taskDoc.ref.update({ deliveryClaimedAt: nowIso });
    } catch {
      skipped += 1;
      continue;
    }

    try {
      const phase = resolvePhase(task);
      const result = await firePersonalTaskReminder({
        taskRef: taskDoc.ref,
        task,
        phase,
        now,
      });
      if (result.ok && result.sentDevices > 0) {
        sentTasks += 1;
        sentDevices += result.sentDevices;
      } else {
        skipped += 1;
        if (!result.ok) errors.push(`${taskDoc.id}: ${result.error}`);
        else await taskDoc.ref.update({ deliveryClaimedAt: null });
      }
    } catch (error) {
      try {
        await taskDoc.ref.update({ deliveryClaimedAt: null });
      } catch {
        /* ignore */
      }
      errors.push(
        `${taskDoc.id}: ${error instanceof Error ? error.message : "unknown delivery error"}`
      );
    }
  }

  return NextResponse.json({
    ok: true,
    mode: "backup_poll",
    checked: snapshot.size,
    sentTasks,
    sentDevices,
    skipped,
    errors: errors.slice(0, 20),
    at: nowIso,
  });
}
