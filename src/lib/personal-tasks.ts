export type PersonalTaskStatus =
  | "todo"
  | "in_progress"
  | "snoozed"
  | "completed"
  | "archived";

export type PersonalTaskPriority = "low" | "normal" | "high" | "urgent";

export type PersonalTaskColor =
  | "sun"
  | "rose"
  | "sky"
  | "mint"
  | "lavender"
  | "peach";

/** none | every day | specific weekdays (0=Sun … 6=Sat, local time) */
export type TaskRecurrence =
  | { type: "none" }
  | { type: "daily" }
  | { type: "weekly"; weekdays: number[] };

export type ReminderPhase = "pre_start" | "start" | "end";

export interface PersonalTask {
  id: string;
  ownerUid: string;
  title: string;
  notes?: string;
  /** Occurrence start (ISO). */
  dueAt?: string | null;
  /** Occurrence end (ISO). */
  endAt?: string | null;
  recurrence?: TaskRecurrence | null;
  /** Optional last day the series may run (ISO date or datetime). */
  recurrenceUntil?: string | null;
  /** Next scheduled push time (ISO). */
  nextFireAt?: string | null;
  reminderPhase?: ReminderPhase | null;
  reminderAt?: string | null;
  status: PersonalTaskStatus;
  priority: PersonalTaskPriority;
  color: PersonalTaskColor;
  tags?: string[];
  order: number;
  /** Free-form sticky board coordinates in pixels. */
  boardX?: number | null;
  boardY?: number | null;
  notificationPending?: boolean;
  reminderSentAt?: string | null;
  preStartSentAt?: string | null;
  startSentAt?: string | null;
  endSentAt?: string | null;
  snoozedUntil?: string | null;
  completedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export const TASK_COLORS: Record<
  PersonalTaskColor,
  { label: string; card: string; dot: string }
> = {
  sun: {
    label: "Sunshine",
    card: "border-amber-200 bg-gradient-to-br from-amber-50 via-yellow-50 to-orange-100/80",
    dot: "bg-amber-400",
  },
  rose: {
    label: "Rose",
    card: "border-rose-200 bg-gradient-to-br from-rose-50 via-pink-50 to-rose-100/80",
    dot: "bg-rose-400",
  },
  sky: {
    label: "Sky",
    card: "border-sky-200 bg-gradient-to-br from-sky-50 via-blue-50 to-cyan-100/80",
    dot: "bg-sky-400",
  },
  mint: {
    label: "Mint",
    card: "border-emerald-200 bg-gradient-to-br from-emerald-50 via-teal-50 to-green-100/80",
    dot: "bg-emerald-400",
  },
  lavender: {
    label: "Lavender",
    card: "border-violet-200 bg-gradient-to-br from-violet-50 via-purple-50 to-fuchsia-100/70",
    dot: "bg-violet-400",
  },
  peach: {
    label: "Peach",
    card: "border-orange-200 bg-gradient-to-br from-orange-50 via-amber-50 to-red-100/70",
    dot: "bg-orange-400",
  },
};

export const PRIORITY_LABELS: Record<PersonalTaskPriority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

export function taskDate(value?: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isTaskOverdue(task: PersonalTask, now = new Date()): boolean {
  if (task.status === "completed" || task.status === "archived") return false;
  // Prefer end time when set; otherwise start time.
  const end = taskDate(task.endAt) || taskDate(task.dueAt);
  return !!end && end.getTime() < now.getTime();
}

export function isTaskToday(task: PersonalTask, now = new Date()): boolean {
  const due = taskDate(task.dueAt);
  if (!due) return false;
  return (
    due.getFullYear() === now.getFullYear() &&
    due.getMonth() === now.getMonth() &&
    due.getDate() === now.getDate()
  );
}

export function toDateTimeLocal(value?: string | null): string {
  const date = taskDate(value);
  if (!date) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

