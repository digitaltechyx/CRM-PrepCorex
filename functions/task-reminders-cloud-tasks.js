/**
 * Schedule exact Cloud Tasks alarms when a personal task is written.
 * Target: CRM POST /api/tasks/reminders/fire
 */

const { CloudTasksClient } = require("@google-cloud/tasks");

const PRE_START_MINUTES = 20;

function projectId() {
  if (process.env.GCLOUD_PROJECT) return String(process.env.GCLOUD_PROJECT);
  if (process.env.GCP_PROJECT) return String(process.env.GCP_PROJECT);
  if (process.env.FIREBASE_CONFIG) {
    try {
      return String(JSON.parse(process.env.FIREBASE_CONFIG).projectId || "");
    } catch {
      return "";
    }
  }
  return "";
}

function tasksLocation() {
  return String(process.env.CLOUD_TASKS_LOCATION || "us-central1").trim();
}

function tasksQueue() {
  return String(process.env.CLOUD_TASKS_QUEUE || "crm-task-reminders").trim();
}

function fireUrl() {
  return String(
    process.env.TASK_FIRE_URL ||
      "https://crm.prepservicesfba.com/api/tasks/reminders/fire"
  ).trim();
}

function cronSecret() {
  return String(process.env.CRON_SECRET || "").trim();
}

function scheduleFingerprint(data) {
  if (!data) return "";
  return [
    data.dueAt,
    data.endAt,
    data.status,
    data.notificationPending,
    data.preStartSentAt,
    data.startSentAt,
    data.endSentAt,
    data.snoozedUntil,
    data.reminderPhase,
    data.nextFireAt,
    data.recurrenceUntil,
    JSON.stringify(data.recurrence || null),
  ].join("|");
}

function parseDate(value) {
  if (!value) return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

function listPendingAlarms(task, now = new Date()) {
  const status = String(task.status || "todo");
  if (status === "completed" || status === "archived") return [];

  if (status === "snoozed" && task.snoozedUntil && !task.startSentAt) {
    const snooze = parseDate(task.snoozedUntil);
    if (snooze) return [{ phase: "start", fireAt: snooze }];
  }

  const due = parseDate(task.dueAt);
  if (!due) return [];
  const end = parseDate(task.endAt);
  const alarms = [];

  if (!task.preStartSentAt) {
    alarms.push({
      phase: "pre_start",
      fireAt: new Date(due.getTime() - PRE_START_MINUTES * 60_000),
    });
  }
  if (!task.startSentAt) {
    alarms.push({ phase: "start", fireAt: due });
  }
  if (end && !task.endSentAt) {
    alarms.push({ phase: "end", fireAt: end });
  }

  const cutoff = now.getTime() - 2 * 60_000;
  return alarms.filter((a) => a.fireAt.getTime() >= cutoff);
}

function safeTaskIdPart(value) {
  return String(value || "")
    .replace(/[^A-Za-z0-9_-]/g, "")
    .slice(0, 40);
}

let client;
function getClient() {
  if (!client) client = new CloudTasksClient();
  return client;
}

async function deleteTaskNames(names) {
  const c = getClient();
  await Promise.all(
    (names || []).map(async (name) => {
      if (!name) return;
      try {
        await c.deleteTask({ name });
      } catch (err) {
        const code = err && (err.code || err.status);
        // 5 = NOT_FOUND — already fired or deleted
        if (code !== 5 && code !== 404) {
          console.warn("[Cloud Tasks] delete failed", name, err.message || err);
        }
      }
    })
  );
}

async function createAlarmTasks({ uid, taskId, alarms }) {
  const c = getClient();
  const parent = c.queuePath(projectId(), tasksLocation(), tasksQueue());
  const secret = cronSecret();
  const url = fireUrl();
  const nowMs = Date.now();
  const created = [];

  for (const alarm of alarms) {
    let scheduleMs = alarm.fireAt.getTime();
    if (scheduleMs < nowMs + 5_000) {
      scheduleMs = nowMs + 5_000;
    }
    // Cloud Tasks standard queue: max ~30 days ahead
    const maxAhead = nowMs + 30 * 24 * 3600_000;
    if (scheduleMs > maxAhead) {
      console.warn(
        "[Cloud Tasks] skip alarm >30d ahead",
        taskId,
        alarm.phase,
        alarm.fireAt.toISOString()
      );
      continue;
    }

    const id = [
      "crm",
      safeTaskIdPart(uid).slice(0, 12),
      safeTaskIdPart(taskId),
      alarm.phase.replace("_", ""),
      String(Math.floor(scheduleMs / 1000)),
    ].join("-");

    const body = Buffer.from(
      JSON.stringify({
        uid,
        taskId,
        phase: alarm.phase,
      })
    ).toString("base64");

    try {
      const [task] = await c.createTask({
        parent,
        task: {
          name: `${parent}/tasks/${id}`,
          httpRequest: {
            httpMethod: "POST",
            url,
            headers: {
              "Content-Type": "application/json",
              ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
            },
            body,
          },
          scheduleTime: {
            seconds: Math.floor(scheduleMs / 1000),
          },
        },
      });
      if (task.name) created.push(task.name);
    } catch (err) {
      // Already exists — treat as success
      if (err && (err.code === 6 || String(err.message || "").includes("ALREADY_EXISTS"))) {
        created.push(`${parent}/tasks/${id}`);
        continue;
      }
      console.error("[Cloud Tasks] create failed", taskId, alarm.phase, err.message || err);
      throw err;
    }
  }

  return created;
}

/**
 * Firestore onWrite handler body.
 */
async function syncPersonalTaskCloudTasks(change, context) {
  const uid = context.params.uid;
  const taskId = context.params.taskId;
  const before = change.before.exists ? change.before.data() : null;
  const after = change.after.exists ? change.after.data() : null;

  // Avoid loop when we only update cloudTaskIds
  if (
    before &&
    after &&
    scheduleFingerprint(before) === scheduleFingerprint(after)
  ) {
    return null;
  }

  const oldNames = [
    ...new Set([
      ...((before && before.cloudTaskNames) || []),
      ...((after && after.cloudTaskNames) || []),
    ]),
  ].filter(Boolean);

  if (oldNames.length) {
    await deleteTaskNames(oldNames);
  }

  if (!after) {
    return null;
  }

  const status = String(after.status || "todo");
  if (
    status === "completed" ||
    status === "archived" ||
    after.notificationPending === false
  ) {
    if ((after.cloudTaskNames || []).length) {
      await change.after.ref.update({ cloudTaskNames: [] });
    }
    return null;
  }

  if (!projectId()) {
    console.warn("[Cloud Tasks] No project id; skip scheduling");
    return null;
  }
  if (!cronSecret()) {
    console.warn("[Cloud Tasks] CRON_SECRET missing; skip scheduling");
    return null;
  }

  const alarms = listPendingAlarms(after);
  if (!alarms.length) {
    if ((after.cloudTaskNames || []).length) {
      await change.after.ref.update({ cloudTaskNames: [] });
    }
    return null;
  }

  const created = await createAlarmTasks({ uid, taskId, alarms });
  await change.after.ref.update({ cloudTaskNames: created });
  console.log(
    "[Cloud Tasks] scheduled",
    taskId,
    created.length,
    alarms.map((a) => `${a.phase}@${a.fireAt.toISOString()}`).join(", ")
  );
  return null;
}

module.exports = {
  syncPersonalTaskCloudTasks,
  scheduleFingerprint,
  listPendingAlarms,
};
