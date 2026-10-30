import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { firePersonalTaskReminder } from "@/lib/personal-task-fire";
import type { ReminderPhase } from "@/lib/personal-task-reminders";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

function parsePhase(value: unknown): ReminderPhase | null {
  const phase = String(value || "");
  if (phase === "pre_start" || phase === "start" || phase === "end") return phase;
  return null;
}

/**
 * Cloud Tasks target: fire one reminder phase for one personal task.
 * Body: { uid, taskId, phase }
 */
export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const uid = String(body.uid || "").trim();
  const taskId = String(body.taskId || "").trim();
  const phase = parsePhase(body.phase);

  if (!uid || !taskId || !phase) {
    return NextResponse.json(
      { error: "uid, taskId, and phase (pre_start|start|end) are required" },
      { status: 400 }
    );
  }

  const taskRef = adminDb().collection("users").doc(uid).collection("personalTasks").doc(taskId);
  const snap = await taskRef.get();
  if (!snap.exists) {
    return NextResponse.json({ ok: true, skipped: "task_not_found" });
  }

  const result = await firePersonalTaskReminder({
    taskRef,
    task: snap.data() as Record<string, unknown>,
    phase,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    ok: true,
    taskId,
    phase,
    sentDevices: result.sentDevices,
    skipped: result.skipped || null,
  });
}
