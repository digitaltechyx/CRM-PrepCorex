import type { DocumentReference } from "firebase-admin/firestore";
import { adminMessaging } from "@/lib/firebase-admin";
import {
  afterPhaseSentPatch,
  phaseNotificationCopy,
  type ReminderPhase,
} from "@/lib/personal-task-reminders";
import type { PersonalTask } from "@/lib/personal-tasks";

type FireResult =
  | { ok: true; sentDevices: number; skipped?: string }
  | { ok: false; error: string; status: number };

function phaseAlreadySent(
  task: Record<string, unknown>,
  phase: ReminderPhase
): boolean {
  if (phase === "pre_start") return Boolean(task.preStartSentAt);
  if (phase === "start") return Boolean(task.startSentAt);
  return Boolean(task.endSentAt);
}

/**
 * Send one reminder phase for one personal task, then advance schedule fields.
 */
export async function firePersonalTaskReminder(input: {
  taskRef: DocumentReference;
  task: Record<string, unknown>;
  phase: ReminderPhase;
  now?: Date;
}): Promise<FireResult> {
  const now = input.now || new Date();
  const status = String(input.task.status || "todo");
  if (status === "completed" || status === "archived") {
    return { ok: true, sentDevices: 0, skipped: "completed_or_archived" };
  }
  if (phaseAlreadySent(input.task, input.phase)) {
    return { ok: true, sentDevices: 0, skipped: "phase_already_sent" };
  }

  const userRef = input.taskRef.parent.parent;
  if (!userRef) {
    return { ok: false, error: "Invalid task path", status: 400 };
  }

  const tokenSnapshot = await userRef
    .collection("pushTokens")
    .where("active", "==", true)
    .get();
  const tokenDocs = tokenSnapshot.docs.filter((item) => Boolean(item.data()?.token));
  const tokens = tokenDocs.map((item) => String(item.data().token));
  if (!tokens.length) {
    return { ok: true, sentDevices: 0, skipped: "no_tokens" };
  }

  const taskId = input.taskRef.id;
  const title = String(input.task.title || "Personal task");
  const copy = phaseNotificationCopy(input.phase, title);
  const body = String(input.task.notes || copy.defaultBody).slice(0, 180);
  const notifTitle = copy.title;

  const response = await adminMessaging().sendEachForMulticast({
    tokens,
    data: {
      taskId,
      phase: input.phase,
      title: notifTitle,
      body,
      priority: String(input.task.priority || "normal"),
      url: `/dashboard/tasks?task=${encodeURIComponent(taskId)}`,
    },
    webpush: {
      headers: {
        Urgency: input.task.priority === "urgent" ? "high" : "normal",
      },
      notification: {
        title: notifTitle,
        body,
        icon: "/PCX Testing-11.svg",
        badge: "/PCX Testing-11.svg",
        tag: `crm-task-${taskId}-${input.phase}`,
        requireInteraction:
          input.task.priority === "urgent" || input.phase === "start",
        actions: [
          { action: "open", title: "Open" },
          { action: "complete", title: "Complete" },
        ],
        data: {
          taskId,
          phase: input.phase,
          url: `/dashboard/tasks?task=${encodeURIComponent(taskId)}`,
        },
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
    response.responses.map((result, index) => {
      if (!result.success && invalidCodes.has(String(result.error?.code || ""))) {
        return tokenDocs[index]!.ref.delete();
      }
      return Promise.resolve();
    })
  );

  if (response.successCount <= 0) {
    return {
      ok: false,
      error: "All device deliveries failed",
      status: 502,
    };
  }

  const patch = afterPhaseSentPatch(
    {
      dueAt: input.task.dueAt != null ? String(input.task.dueAt) : null,
      endAt: input.task.endAt != null ? String(input.task.endAt) : null,
      recurrence: (input.task.recurrence as PersonalTask["recurrence"]) || {
        type: "none",
      },
      recurrenceUntil:
        input.task.recurrenceUntil != null
          ? String(input.task.recurrenceUntil)
          : null,
      preStartSentAt:
        input.task.preStartSentAt != null
          ? String(input.task.preStartSentAt)
          : null,
      startSentAt:
        input.task.startSentAt != null ? String(input.task.startSentAt) : null,
      endSentAt: input.task.endSentAt != null ? String(input.task.endSentAt) : null,
      status,
    },
    input.phase,
    now
  );

  await input.taskRef.update({
    ...patch,
    deliveryClaimedAt: null,
    updatedAt: now.toISOString(),
  });

  return { ok: true, sentDevices: response.successCount };
}
