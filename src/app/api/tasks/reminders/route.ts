import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminMessaging } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = adminDb();
  const now = new Date();
  const snapshot = await db
    .collectionGroup("personalTasks")
    .where("notificationPending", "==", true)
    .limit(200)
    .get();

  let sentTasks = 0;
  let sentDevices = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const taskDoc of snapshot.docs) {
    const task = taskDoc.data() as Record<string, unknown>;
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

    const userRef = taskDoc.ref.parent.parent;
    if (!userRef) {
      skipped += 1;
      continue;
    }

    const tokenSnapshot = await userRef.collection("pushTokens").where("active", "==", true).get();
    const tokenDocs = tokenSnapshot.docs.filter((item: any) => Boolean(item.data()?.token));
    const tokens = tokenDocs.map((item: any) => String(item.data().token));
    if (!tokens.length) {
      skipped += 1;
      continue;
    }

    try {
      const taskId = taskDoc.id;
      const title = String(task.title || "Personal task");
      const body = String(task.notes || "Your task is due now.").slice(0, 180);
      const response = await adminMessaging().sendEachForMulticast({
        tokens,
        data: {
          taskId,
          title: `Due now: ${title}`,
          body,
          priority: String(task.priority || "normal"),
          url: `/dashboard/tasks?task=${encodeURIComponent(taskId)}`,
        },
        webpush: {
          headers: { Urgency: task.priority === "urgent" ? "high" : "normal" },
          notification: {
            title: `Due now: ${title}`,
            body,
            icon: "/PCX Testing-11.svg",
            badge: "/PCX Testing-11.svg",
            tag: `crm-task-${taskId}`,
            requireInteraction: task.priority === "urgent",
            actions: [
              { action: "open", title: "Open" },
              { action: "complete", title: "Complete" },
            ],
            data: { taskId, url: `/dashboard/tasks?task=${encodeURIComponent(taskId)}` },
          },
          fcmOptions: {
            link: `/dashboard/tasks?task=${encodeURIComponent(taskId)}`,
          },
        },
      });

      const invalidCodes = new Set([
        "messaging/registration-token-not-registered",
        "messaging/invalid-registration-token",
        "messaging/invalid-argument",
      ]);
      await Promise.all(
        response.responses.map((result: any, index: number) => {
          if (!result.success && invalidCodes.has(result.error?.code)) {
            return tokenDocs[index].ref.delete();
          }
          return Promise.resolve();
        })
      );

      if (response.successCount > 0) {
        await taskDoc.ref.update({
          notificationPending: false,
          reminderSentAt: now.toISOString(),
          updatedAt: now.toISOString(),
        });
        sentTasks += 1;
        sentDevices += response.successCount;
      }
      if (response.failureCount) {
        errors.push(`${taskId}: ${response.failureCount} device delivery failure(s)`);
      }
    } catch (error) {
      errors.push(
        `${taskDoc.id}: ${error instanceof Error ? error.message : "unknown delivery error"}`
      );
    }
  }

  return NextResponse.json({
    ok: true,
    checked: snapshot.size,
    sentTasks,
    sentDevices,
    skipped,
    errors: errors.slice(0, 20),
    at: now.toISOString(),
  });
}

