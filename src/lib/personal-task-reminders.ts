import type { PersonalTask, TaskRecurrence } from "@/lib/personal-tasks";
import { taskDate } from "@/lib/personal-tasks";

export type ReminderPhase = "pre_start" | "start" | "end";

export const PRE_START_MINUTES = 20;

export type ReminderScheduleState = {
  /** May roll forward for recurring tasks whose current occurrence is fully past. */
  dueAt: string | null;
  endAt: string | null;
  nextFireAt: string | null;
  reminderPhase: ReminderPhase | null;
  reminderAt: string | null;
  notificationPending: boolean;
  preStartSentAt: string | null;
  startSentAt: string | null;
  endSentAt: string | null;
};

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function normalizeRecurrence(
  value: TaskRecurrence | null | undefined
): TaskRecurrence {
  if (!value || value.type === "none") return { type: "none" };
  if (value.type === "daily") return { type: "daily" };
  const weekdays = Array.from(
    new Set(
      (value.weekdays || [])
        .map((d) => Number(d))
        .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    )
  ).sort((a, b) => a - b);
  if (!weekdays.length) return { type: "none" };
  return { type: "weekly", weekdays };
}

export function recurrenceLabel(recurrence?: TaskRecurrence | null): string | null {
  const r = normalizeRecurrence(recurrence);
  if (r.type === "none") return null;
  if (r.type === "daily") return "Every day";
  return `Weekly · ${r.weekdays.map((d) => WEEKDAY_LABELS[d]).join(", ")}`;
}

function durationMs(start: Date, end: Date | null): number {
  if (!end) return 30 * 60_000;
  const ms = end.getTime() - start.getTime();
  return ms > 0 ? ms : 30 * 60_000;
}

/** Next calendar day (local) matching recurrence after `from` (exclusive of from's day if skipSameDay). */
export function nextOccurrenceStart(
  fromStart: Date,
  recurrence: TaskRecurrence,
  opts?: { afterExclusive?: boolean }
): Date | null {
  const r = normalizeRecurrence(recurrence);
  if (r.type === "none") return null;

  const cursor = new Date(fromStart.getTime());
  if (opts?.afterExclusive) {
    cursor.setDate(cursor.getDate() + 1);
  }

  for (let i = 0; i < 400; i += 1) {
    if (r.type === "daily") {
      return cursor;
    }
    if (r.weekdays.includes(cursor.getDay())) {
      return cursor;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return null;
}

function withinRecurrenceUntil(start: Date, untilIso?: string | null): boolean {
  if (!untilIso) return true;
  const until = taskDate(untilIso);
  if (!until) return true;
  // Compare by local calendar day end of until
  const untilEnd = new Date(until);
  untilEnd.setHours(23, 59, 59, 999);
  return start.getTime() <= untilEnd.getTime();
}

type FirePlan = {
  nextFireAt: string;
  reminderPhase: ReminderPhase;
};

/**
 * Decide the next notification fire for the current occurrence,
 * given which phases were already sent.
 */
export function planNextFireForOccurrence(input: {
  dueAt: Date;
  endAt: Date | null;
  now?: Date;
  preStartSentAt?: string | null;
  startSentAt?: string | null;
  endSentAt?: string | null;
}): FirePlan | null {
  const now = input.now || new Date();
  const start = input.dueAt;
  const end = input.endAt;
  const preAt = new Date(start.getTime() - PRE_START_MINUTES * 60_000);

  if (!input.preStartSentAt) {
    // Still notify (immediately) if we're inside the 20m window before start
    if (now.getTime() < start.getTime()) {
      return {
        nextFireAt: (now.getTime() >= preAt.getTime() ? now : preAt).toISOString(),
        reminderPhase: "pre_start",
      };
    }
    // Missed pre-start entirely — skip to start
  }

  if (!input.startSentAt) {
    return {
      nextFireAt: (now.getTime() >= start.getTime() ? now : start).toISOString(),
      reminderPhase: "start",
    };
  }

  if (end && !input.endSentAt) {
    return {
      nextFireAt: (now.getTime() >= end.getTime() ? now : end).toISOString(),
      reminderPhase: "end",
    };
  }

  return null;
}

export function buildReminderSchedule(input: {
  dueAt: string | null;
  endAt?: string | null;
  recurrence?: TaskRecurrence | null;
  recurrenceUntil?: string | null;
  status: string;
  now?: Date;
  /** When snoozing, force next fire to this instant as a "start" nudge */
  snoozeUntil?: string | null;
  /** Internal: already-sent flags when resuming mid-occurrence */
  preStartSentAt?: string | null;
  startSentAt?: string | null;
  endSentAt?: string | null;
}): ReminderScheduleState {
  const empty: ReminderScheduleState = {
    dueAt: input.dueAt,
    endAt: input.endAt || null,
    nextFireAt: null,
    reminderPhase: null,
    reminderAt: null,
    notificationPending: false,
    preStartSentAt: null,
    startSentAt: null,
    endSentAt: null,
  };

  if (input.status === "completed" || input.status === "archived") {
    return empty;
  }

  if (input.snoozeUntil) {
    const snooze = taskDate(input.snoozeUntil);
    if (snooze) {
      return {
        dueAt: input.dueAt,
        endAt: input.endAt || null,
        nextFireAt: snooze.toISOString(),
        reminderPhase: "start",
        reminderAt: snooze.toISOString(),
        notificationPending: true,
        preStartSentAt: new Date().toISOString(), // skip pre-start after snooze
        startSentAt: null,
        endSentAt: null,
      };
    }
  }

  const due = taskDate(input.dueAt);
  if (!due) return empty;

  const end = taskDate(input.endAt || null);
  const plan = planNextFireForOccurrence({
    dueAt: due,
    endAt: end,
    now: input.now,
    preStartSentAt: input.preStartSentAt,
    startSentAt: input.startSentAt,
    endSentAt: input.endSentAt,
  });

  if (!plan) {
    // Current occurrence fully notified — try next recurrence
    const advanced = advanceToNextOccurrence({
      dueAt: due,
      endAt: end,
      recurrence: input.recurrence,
      recurrenceUntil: input.recurrenceUntil,
      now: input.now,
    });
    if (!advanced) {
      return {
        ...empty,
        dueAt: input.dueAt,
        endAt: input.endAt || null,
        preStartSentAt: input.preStartSentAt || null,
        startSentAt: input.startSentAt || null,
        endSentAt: input.endSentAt || null,
      };
    }
    return buildReminderSchedule({
      ...input,
      dueAt: advanced.dueAt,
      endAt: advanced.endAt,
      snoozeUntil: null,
      preStartSentAt: null,
      startSentAt: null,
      endSentAt: null,
    });
  }

  return {
    dueAt: due.toISOString(),
    endAt: end ? end.toISOString() : input.endAt || null,
    nextFireAt: plan.nextFireAt,
    reminderPhase: plan.reminderPhase,
    reminderAt: plan.nextFireAt,
    notificationPending: true,
    preStartSentAt: input.preStartSentAt || null,
    startSentAt: input.startSentAt || null,
    endSentAt: input.endSentAt || null,
  };
}

export function advanceToNextOccurrence(input: {
  dueAt: Date;
  endAt: Date | null;
  recurrence?: TaskRecurrence | null;
  recurrenceUntil?: string | null;
  now?: Date;
}): { dueAt: string; endAt: string | null } | null {
  const r = normalizeRecurrence(input.recurrence);
  if (r.type === "none") return null;

  const dur = durationMs(input.dueAt, input.endAt);
  const nextStart = nextOccurrenceStart(input.dueAt, r, { afterExclusive: true });
  if (!nextStart) return null;

  // Preserve wall-clock time-of-day from original dueAt
  nextStart.setHours(
    input.dueAt.getHours(),
    input.dueAt.getMinutes(),
    input.dueAt.getSeconds(),
    0
  );

  if (!withinRecurrenceUntil(nextStart, input.recurrenceUntil)) return null;

  const nextEnd = new Date(nextStart.getTime() + dur);
  return {
    dueAt: nextStart.toISOString(),
    endAt: input.endAt ? nextEnd.toISOString() : null,
  };
}

/**
 * After a phase is delivered, compute the Firestore patch for the task.
 */
export function afterPhaseSentPatch(
  task: Pick<
    PersonalTask,
    | "dueAt"
    | "endAt"
    | "recurrence"
    | "recurrenceUntil"
    | "preStartSentAt"
    | "startSentAt"
    | "endSentAt"
    | "status"
  >,
  phase: ReminderPhase,
  now = new Date()
): Record<string, unknown> {
  const sentIso = now.toISOString();
  const preStartSentAt = phase === "pre_start" ? sentIso : task.preStartSentAt || null;
  const startSentAt = phase === "start" ? sentIso : task.startSentAt || null;
  const endSentAt = phase === "end" ? sentIso : task.endSentAt || null;

  const due = taskDate(task.dueAt);
  if (!due) {
    return {
      notificationPending: false,
      nextFireAt: null,
      reminderPhase: null,
      reminderAt: null,
      preStartSentAt,
      startSentAt,
      endSentAt,
      reminderSentAt: sentIso,
    };
  }

  const end = taskDate(task.endAt || null);
  const plan = planNextFireForOccurrence({
    dueAt: due,
    endAt: end,
    now,
    preStartSentAt,
    startSentAt,
    endSentAt,
  });

  if (plan) {
    return {
      notificationPending: true,
      nextFireAt: plan.nextFireAt,
      reminderPhase: plan.reminderPhase,
      reminderAt: plan.nextFireAt,
      preStartSentAt,
      startSentAt,
      endSentAt,
      reminderSentAt: sentIso,
    };
  }

  // Occurrence complete — roll forward if recurring
  const advanced = advanceToNextOccurrence({
    dueAt: due,
    endAt: end,
    recurrence: task.recurrence,
    recurrenceUntil: task.recurrenceUntil,
    now,
  });

  if (!advanced) {
    return {
      notificationPending: false,
      nextFireAt: null,
      reminderPhase: null,
      reminderAt: null,
      preStartSentAt,
      startSentAt,
      endSentAt,
      reminderSentAt: sentIso,
      // One-shot series finished
    };
  }

  const nextPlan = planNextFireForOccurrence({
    dueAt: new Date(advanced.dueAt),
    endAt: advanced.endAt ? new Date(advanced.endAt) : null,
    now,
  });

  return {
    dueAt: advanced.dueAt,
    endAt: advanced.endAt,
    preStartSentAt: null,
    startSentAt: null,
    endSentAt: null,
    reminderSentAt: sentIso,
    notificationPending: !!nextPlan,
    nextFireAt: nextPlan?.nextFireAt || null,
    reminderPhase: nextPlan?.reminderPhase || null,
    reminderAt: nextPlan?.nextFireAt || null,
  };
}

export function phaseNotificationCopy(
  phase: ReminderPhase,
  title: string
): { title: string; defaultBody: string } {
  if (phase === "pre_start") {
    return {
      title: `In 20 min: ${title}`,
      defaultBody: "This task starts in about 20 minutes.",
    };
  }
  if (phase === "end") {
    return {
      title: `Ended: ${title}`,
      defaultBody: "This task’s scheduled time has ended.",
    };
  }
  return {
    title: `Starting now: ${title}`,
    defaultBody: "Your task is starting now.",
  };
}

export type ReminderAlarm = {
  phase: ReminderPhase;
  /** Absolute time the Cloud Task should run */
  fireAt: Date;
};

/**
 * Absolute alarm times still needed for the current occurrence
 * (used by Cloud Tasks scheduler — not the polling “next fire” helper).
 */
export function listPendingReminderAlarms(
  task: Pick<
    PersonalTask,
    | "dueAt"
    | "endAt"
    | "status"
    | "preStartSentAt"
    | "startSentAt"
    | "endSentAt"
    | "snoozedUntil"
  >,
  now = new Date()
): ReminderAlarm[] {
  if (task.status === "completed" || task.status === "archived") return [];

  // Snooze replaces the next start nudge
  if (task.status === "snoozed" && task.snoozedUntil && !task.startSentAt) {
    const snooze = taskDate(task.snoozedUntil);
    if (snooze) return [{ phase: "start", fireAt: snooze }];
  }

  const due = taskDate(task.dueAt);
  if (!due) return [];
  const end = taskDate(task.endAt || null);
  const alarms: ReminderAlarm[] = [];

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

  // Drop alarms more than 2 minutes in the past (already missed); scheduler
  // will create near-immediate tasks for slightly-late ones.
  const cutoff = now.getTime() - 2 * 60_000;
  return alarms.filter((a) => a.fireAt.getTime() >= cutoff);
}

/** Fingerprint of schedule fields — used to avoid Cloud Tasks sync loops. */
export function taskScheduleFingerprint(
  data: Record<string, unknown> | null | undefined
): string {
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
