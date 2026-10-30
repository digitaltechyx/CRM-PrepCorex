"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  updateDoc,
} from "firebase/firestore";
import {
  Bell,
  BellRing,
  CalendarClock,
  Check,
  CheckCircle2,
  Circle,
  Clock3,
  GripVertical,
  LayoutGrid,
  ListFilter,
  Loader2,
  MoreHorizontal,
  Move,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Tag,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import {
  PRIORITY_LABELS,
  TASK_COLORS,
  isTaskOverdue,
  isTaskToday,
  taskDate,
  toDateTimeLocal,
  type PersonalTask,
  type PersonalTaskColor,
  type PersonalTaskPriority,
  type PersonalTaskStatus,
  type TaskRecurrence,
} from "@/lib/personal-tasks";
import {
  buildReminderSchedule,
  normalizeRecurrence,
  recurrenceLabel,
} from "@/lib/personal-task-reminders";
import {
  enableCrmPushNotifications,
  hasCrmPushDeviceRegistered,
  listenForCrmForegroundMessages,
  vapidKeyConfigured,
} from "@/lib/crm-push-notifications";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type TaskFilter =
  | "current"
  | "today"
  | "overdue"
  | "upcoming"
  | "snoozed"
  | "completed"
  | "all";

type EditorState = {
  id?: string;
  title: string;
  notes: string;
  dueAt: string;
  endAt: string;
  recurrenceType: "none" | "daily" | "weekly";
  weekdays: number[];
  recurrenceUntil: string;
  priority: PersonalTaskPriority;
  color: PersonalTaskColor;
  status: PersonalTaskStatus;
  tags: string;
};

const EMPTY_EDITOR: EditorState = {
  title: "",
  notes: "",
  dueAt: "",
  endAt: "",
  recurrenceType: "none",
  weekdays: [1, 3, 5],
  recurrenceUntil: "",
  priority: "normal",
  color: "sun",
  status: "todo",
  tags: "",
};

const WEEKDAY_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

function editorRecurrence(editor: EditorState): TaskRecurrence {
  if (editor.recurrenceType === "daily") return { type: "daily" };
  if (editor.recurrenceType === "weekly") {
    return normalizeRecurrence({ type: "weekly", weekdays: editor.weekdays });
  }
  return { type: "none" };
}

function scheduleLabel(task: PersonalTask): string {
  const start = dateTimeLabel(task.dueAt);
  if (!task.dueAt) return "No schedule";
  const end = task.endAt ? dateTimeLabel(task.endAt) : null;
  const recur = recurrenceLabel(task.recurrence);
  if (end && recur) return `${start} → ${end} · ${recur}`;
  if (end) return `${start} → ${end}`;
  if (recur) return `${start} · ${recur}`;
  return start;
}

const FILTERS: Array<{ id: TaskFilter; label: string }> = [
  { id: "current", label: "Current" },
  { id: "today", label: "Today" },
  { id: "overdue", label: "Overdue" },
  { id: "upcoming", label: "Upcoming" },
  { id: "snoozed", label: "Snoozed" },
  { id: "completed", label: "Completed" },
  { id: "all", label: "All" },
];

const NOTE_WIDTH = 260;
const NOTE_MIN_HEIGHT = 220;
const BOARD_PADDING = 16;
const BOARD_MIN_HEIGHT = 560;

function defaultBoardPosition(index: number): { x: number; y: number } {
  const col = index % 3;
  const row = Math.floor(index / 3);
  return {
    x: BOARD_PADDING + col * (NOTE_WIDTH + 28) + (row % 2) * 18,
    y: BOARD_PADDING + row * (NOTE_MIN_HEIGHT + 28) + (col % 2) * 12,
  };
}

function noteTilt(taskId: string): number {
  let hash = 0;
  for (let i = 0; i < taskId.length; i += 1) hash = (hash + taskId.charCodeAt(i) * (i + 1)) % 11;
  return hash - 5;
}

function resolveBoardPosition(task: PersonalTask, index: number): { x: number; y: number } {
  if (typeof task.boardX === "number" && typeof task.boardY === "number") {
    return { x: task.boardX, y: task.boardY };
  }
  return defaultBoardPosition(index);
}

function dateTimeLabel(value?: string | null): string {
  const date = taskDate(value);
  if (!date) return "No date";
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  const day = sameDay(date, today)
    ? "Today"
    : sameDay(date, tomorrow)
      ? "Tomorrow"
      : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${day}, ${date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

function priorityClass(priority: PersonalTaskPriority): string {
  if (priority === "urgent") return "border-red-300 bg-red-100 text-red-800";
  if (priority === "high") return "border-orange-300 bg-orange-100 text-orange-800";
  if (priority === "low") return "border-slate-300 bg-slate-100 text-slate-700";
  return "border-blue-200 bg-blue-50 text-blue-700";
}

function FreeStickyNote({
  task,
  x,
  y,
  zIndex,
  isDragging,
  onPointerDown,
  onContentClick,
  onComplete,
  onEdit,
  onDelete,
  onSnooze,
  onReopen,
}: {
  task: PersonalTask;
  x: number;
  y: number;
  zIndex: number;
  isDragging: boolean;
  onPointerDown: (event: PointerEvent, taskId: string) => void;
  onContentClick: (task: PersonalTask) => void;
  onComplete: (task: PersonalTask) => void;
  onEdit: (task: PersonalTask) => void;
  onDelete: (task: PersonalTask) => void;
  onSnooze: (task: PersonalTask, minutes: number) => void;
  onReopen: (task: PersonalTask) => void;
}) {
  const overdue = isTaskOverdue(task);
  const completed = task.status === "completed";
  const color = TASK_COLORS[task.color] ?? TASK_COLORS.sun;
  const tilt = noteTilt(task.id);

  return (
    <article
      data-sticky-note
      onPointerDown={(event) => onPointerDown(event.nativeEvent, task.id)}
      style={{
        left: x,
        top: y,
        width: NOTE_WIDTH,
        zIndex,
        transform: isDragging
          ? `rotate(${tilt * 0.2}deg) scale(1.05)`
          : `rotate(${tilt * 0.35}deg)`,
      }}
      className={cn(
        "group absolute flex min-h-[220px] touch-none select-none flex-col overflow-hidden rounded-[1.25rem] border p-4 text-slate-900 shadow-[0_18px_40px_-22px_rgba(15,23,42,0.5)] ring-1 ring-white/70 transition-[box-shadow,transform] duration-150 sm:p-5",
        "cursor-grab active:cursor-grabbing",
        color.card,
        overdue && "ring-2 ring-red-400/70",
        completed && "opacity-75 grayscale-[.15]",
        isDragging && "shadow-2xl ring-2 ring-indigo-400/50"
      )}
    >
      <div
        className="absolute inset-x-0 top-0 h-1.5 opacity-80"
        style={{
          background:
            task.priority === "urgent"
              ? "#ef4444"
              : task.priority === "high"
                ? "#f97316"
                : task.priority === "low"
                  ? "#94a3b8"
                  : "#3b82f6",
        }}
      />
      <div className="flex items-start justify-between gap-2">
        <div className="mt-0.5 inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-slate-500/80">
          <GripVertical className="h-4 w-4" />
          <Move className="h-3.5 w-3.5 opacity-70" />
        </div>
        <div className="flex flex-wrap justify-end gap-1.5">
          <Badge variant="outline" className={cn("text-[10px] uppercase", priorityClass(task.priority))}>
            {PRIORITY_LABELS[task.priority]}
          </Badge>
          {overdue ? (
            <Badge className="border-0 bg-red-600 text-[10px] uppercase text-white">Overdue</Badge>
          ) : null}
        </div>
      </div>

      <button
        type="button"
        onClick={() => onContentClick(task)}
        className="mt-3 min-w-0 flex-1 cursor-inherit text-left"
      >
        <h3
          className={cn(
            "font-headline text-lg font-bold leading-snug tracking-tight text-slate-900",
            completed && "line-through decoration-2"
          )}
        >
          {task.title}
        </h3>
        {task.notes ? (
          <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
            {task.notes}
          </p>
        ) : (
          <p className="mt-2 text-sm italic text-slate-500/80">Tap to add details…</p>
        )}
      </button>

      {task.tags?.length ? (
        <div className="mt-3 flex flex-wrap gap-1">
          {task.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-full bg-white/55 px-2 py-1 text-[10px] font-semibold text-slate-600 ring-1 ring-black/5"
            >
              <Tag className="h-2.5 w-2.5" />
              {tag}
            </span>
          ))}
        </div>
      ) : null}

      <div
        data-note-actions
        className="mt-4 flex items-center justify-between gap-2 border-t border-slate-900/10 pt-3 touch-auto"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className={cn("flex min-w-0 items-center gap-1.5 text-xs font-semibold", overdue ? "text-red-700" : "text-slate-600")}>
          <CalendarClock className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate" title={scheduleLabel(task)}>
            {scheduleLabel(task)}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1 touch-auto">
          {completed ? (
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 rounded-full bg-white/55 text-slate-700 hover:bg-white"
              onClick={() => onReopen(task)}
              title="Reopen"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              size="sm"
              className="h-8 gap-1 rounded-full bg-slate-900 px-3 text-xs text-white shadow-sm hover:bg-slate-800"
              onClick={() => onComplete(task)}
            >
              <Check className="h-3.5 w-3.5" />
              Complete
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 rounded-full bg-white/55 text-slate-700 hover:bg-white"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(task)}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              {!completed ? (
                <>
                  <DropdownMenuItem onClick={() => onSnooze(task, 10)}>
                    <Clock3 className="mr-2 h-4 w-4" />
                    Snooze 10 minutes
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onSnooze(task, 60)}>
                    <Clock3 className="mr-2 h-4 w-4" />
                    Snooze 1 hour
                  </DropdownMenuItem>
                </>
              ) : null}
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-red-600" onClick={() => onDelete(task)}>
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </article>
  );
}

type DragState = {
  taskId: string;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  pointerId: number;
  moved: boolean;
};

export function PersonalTaskBoard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const boardRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const suppressClickRef = useRef<string | null>(null);
  const [tasks, setTasks] = useState<PersonalTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editor, setEditor] = useState<EditorState>(EMPTY_EDITOR);
  const [filter, setFilter] = useState<TaskFilter>("current");
  const [priorityFilter, setPriorityFilter] = useState<PersonalTaskPriority | "all">("all");
  const [search, setSearch] = useState("");
  const [pushReady, setPushReady] = useState(false);
  const [enablingNotifications, setEnablingNotifications] = useState(false);
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [boardWidth, setBoardWidth] = useState(900);

  const taskCollection = useMemo(
    () => (user ? collection(db, "users", user.uid, "personalTasks") : null),
    [user]
  );

  useEffect(() => {
    setPushReady(hasCrmPushDeviceRegistered());
  }, []);

  useEffect(() => {
    if (!user) return;
    let unsubscribe = () => undefined;
    void listenForCrmForegroundMessages((payload) => {
      toast({
        title: payload.title,
        description: payload.body,
      });
    }).then((stop) => {
      unsubscribe = stop;
    });
    return () => unsubscribe();
  }, [toast, user]);

  useEffect(() => {
    if (!taskCollection) return;
    const unsubscribe = onSnapshot(
      taskCollection,
      (snapshot) => {
        const rows = snapshot.docs.map((item) => ({
          id: item.id,
          ...(item.data() as Omit<PersonalTask, "id">),
        }));
        rows.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        setTasks(rows);
        setPositions((current) => {
          const next: Record<string, { x: number; y: number }> = {};
          rows.forEach((task, index) => {
            if (dragRef.current?.taskId === task.id && current[task.id]) {
              next[task.id] = current[task.id];
              return;
            }
            next[task.id] = resolveBoardPosition(task, index);
          });
          return next;
        });
        setLoading(false);
      },
      (error) => {
        console.error("[personal tasks]", error);
        toast({
          variant: "destructive",
          title: "Could not load your planner",
          description: error.message,
        });
        setLoading(false);
      }
    );
    return unsubscribe;
  }, [taskCollection, toast]);

  const updateTask = useCallback(
    async (taskId: string, values: Record<string, unknown>) => {
      if (!user) return;
      await updateDoc(doc(db, "users", user.uid, "personalTasks", taskId), {
        ...values,
        updatedAt: new Date().toISOString(),
      });
    },
    [user]
  );

  useEffect(() => {
    if (!user || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const completeId = params.get("complete");
    if (!completeId || !tasks.some((task) => task.id === completeId)) return;
    void updateTask(completeId, {
      status: "completed",
      completedAt: new Date().toISOString(),
      notificationPending: false,
      nextFireAt: null,
      reminderPhase: null,
    });
    params.delete("complete");
    window.history.replaceState({}, "", `${window.location.pathname}${params.size ? `?${params}` : ""}`);
  }, [tasks, updateTask, user]);

  const counts = useMemo(() => {
    const active = tasks.filter((task) => task.status !== "completed" && task.status !== "archived");
    return {
      current: active.length,
      today: active.filter((task) => isTaskToday(task)).length,
      overdue: active.filter((task) => isTaskOverdue(task)).length,
      completed: tasks.filter((task) => task.status === "completed").length,
    };
  }, [tasks]);

  const visibleTasks = useMemo(() => {
    const now = new Date();
    const query = search.trim().toLowerCase();
    return tasks.filter((task) => {
      const due = taskDate(task.dueAt);
      const active = task.status !== "completed" && task.status !== "archived";
      if (filter === "current" && !active) return false;
      if (filter === "today" && (!active || !isTaskToday(task, now))) return false;
      if (filter === "overdue" && (!active || !isTaskOverdue(task, now))) return false;
      if (filter === "upcoming" && (!active || !due || due.getTime() <= now.getTime())) return false;
      if (filter === "snoozed" && task.status !== "snoozed") return false;
      if (filter === "completed" && task.status !== "completed") return false;
      if (priorityFilter !== "all" && task.priority !== priorityFilter) return false;
      if (
        query &&
        !`${task.title} ${task.notes ?? ""} ${(task.tags ?? []).join(" ")}`
          .toLowerCase()
          .includes(query)
      ) {
        return false;
      }
      return true;
    });
  }, [filter, priorityFilter, search, tasks]);

  const boardHeight = useMemo(() => {
    const maxY = visibleTasks.reduce((max, task, index) => {
      const point = positions[task.id] ?? resolveBoardPosition(task, index);
      return Math.max(max, point.y + NOTE_MIN_HEIGHT + BOARD_PADDING);
    }, BOARD_MIN_HEIGHT);
    return Math.max(BOARD_MIN_HEIGHT, maxY);
  }, [positions, visibleTasks]);

  const nextCreatePosition = useCallback(() => {
    const occupied = Object.values(positions);
    if (!occupied.length) return defaultBoardPosition(0);
    const maxY = Math.max(...occupied.map((point) => point.y));
    const bottomRow = occupied.filter((point) => Math.abs(point.y - maxY) < 40);
    const lastX = Math.max(...bottomRow.map((point) => point.x));
    const nextX = lastX + NOTE_WIDTH + 28;
    if (nextX + NOTE_WIDTH < Math.max(boardWidth, 360) - BOARD_PADDING) {
      return { x: nextX, y: maxY + ((bottomRow.length % 2) * 10) };
    }
    return { x: BOARD_PADDING, y: maxY + NOTE_MIN_HEIGHT + 28 };
  }, [boardWidth, positions]);

  const clampPosition = useCallback(
    (x: number, y: number) => {
      const maxX = Math.max(BOARD_PADDING, boardWidth - NOTE_WIDTH - BOARD_PADDING);
      return {
        x: Math.min(Math.max(BOARD_PADDING, x), maxX),
        y: Math.max(BOARD_PADDING, y),
      };
    },
    [boardWidth]
  );

  const handleNotePointerDown = useCallback(
    (event: PointerEvent, taskId: string) => {
      if (event.button !== 0) return;
      const target = event.target as HTMLElement | null;
      if (
        target?.closest(
          "[data-note-actions], [role='menuitem'], [data-radix-collection-item], input, textarea, a"
        )
      ) {
        return;
      }
      const origin = positions[taskId] ?? defaultBoardPosition(0);
      dragRef.current = {
        taskId,
        startX: event.clientX,
        startY: event.clientY,
        originX: origin.x,
        originY: origin.y,
        pointerId: event.pointerId,
        moved: false,
      };
      setDraggingId(taskId);
      suppressClickRef.current = null;
    },
    [positions]
  );

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (!drag.moved && Math.hypot(dx, dy) < 6) return;
      drag.moved = true;
      const next = clampPosition(drag.originX + dx, drag.originY + dy);
      setPositions((current) => ({ ...current, [drag.taskId]: next }));
    };

    const onUp = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const next = clampPosition(
        drag.originX + (event.clientX - drag.startX),
        drag.originY + (event.clientY - drag.startY)
      );
      const moved = drag.moved;
      dragRef.current = null;
      setDraggingId(null);
      if (!moved) return;
      suppressClickRef.current = drag.taskId;
      setPositions((current) => ({ ...current, [drag.taskId]: next }));
      void updateTask(drag.taskId, { boardX: next.x, boardY: next.y });
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [clampPosition, updateTask]);

  useEffect(() => {
    if (loading || visibleTasks.length === 0) return;
    const node = boardRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) setBoardWidth(width);
    });
    observer.observe(node);
    setBoardWidth(node.clientWidth || 900);
    return () => observer.disconnect();
  }, [loading, visibleTasks.length]);

  const openCreate = () => {
    const now = new Date();
    now.setMinutes(Math.ceil(now.getMinutes() / 15) * 15, 0, 0);
    const end = new Date(now.getTime() + 30 * 60_000);
    setEditor({
      ...EMPTY_EDITOR,
      dueAt: toDateTimeLocal(now.toISOString()),
      endAt: toDateTimeLocal(end.toISOString()),
    });
    setEditorOpen(true);
  };

  const openEdit = (task: PersonalTask) => {
    const r = normalizeRecurrence(task.recurrence);
    setEditor({
      id: task.id,
      title: task.title,
      notes: task.notes ?? "",
      dueAt: toDateTimeLocal(task.dueAt),
      endAt: toDateTimeLocal(task.endAt),
      recurrenceType: r.type,
      weekdays: r.type === "weekly" ? r.weekdays : [1, 3, 5],
      recurrenceUntil: task.recurrenceUntil
        ? toDateTimeLocal(task.recurrenceUntil).slice(0, 10)
        : "",
      priority: task.priority,
      color: task.color,
      status: task.status,
      tags: (task.tags ?? []).join(", "),
    });
    setEditorOpen(true);
  };

  const handleNoteContentClick = useCallback(
    (task: PersonalTask) => {
      if (suppressClickRef.current === task.id) {
        suppressClickRef.current = null;
        return;
      }
      openEdit(task);
    },
    []
  );

  const saveTask = async () => {
    if (!user || !taskCollection || !editor.title.trim()) return;
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const dueAt = editor.dueAt ? new Date(editor.dueAt).toISOString() : null;
      let endAt = editor.endAt ? new Date(editor.endAt).toISOString() : null;
      if (dueAt && endAt && new Date(endAt).getTime() <= new Date(dueAt).getTime()) {
        toast({
          variant: "destructive",
          title: "Invalid end time",
          description: "End date & time must be after the start.",
        });
        setSaving(false);
        return;
      }
      if (dueAt && !endAt) {
        endAt = new Date(new Date(dueAt).getTime() + 30 * 60_000).toISOString();
      }
      const recurrence = editorRecurrence(editor);
      if (recurrence.type === "weekly" && recurrence.weekdays.length === 0) {
        toast({
          variant: "destructive",
          title: "Pick weekdays",
          description: "Choose at least one day for a weekly task.",
        });
        setSaving(false);
        return;
      }
      const recurrenceUntil = editor.recurrenceUntil
        ? new Date(`${editor.recurrenceUntil}T23:59:59`).toISOString()
        : null;
      const schedule = buildReminderSchedule({
        dueAt,
        endAt,
        recurrence,
        recurrenceUntil,
        status: editor.status,
      });
      const tags = editor.tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean)
        .slice(0, 8);
      const payload = {
        ownerUid: user.uid,
        title: editor.title.trim(),
        notes: editor.notes.trim(),
        dueAt: schedule.dueAt,
        endAt: schedule.endAt,
        recurrence,
        recurrenceUntil,
        reminderAt: schedule.reminderAt,
        nextFireAt: schedule.nextFireAt,
        reminderPhase: schedule.reminderPhase,
        priority: editor.priority,
        color: editor.color,
        status: editor.status,
        tags,
        notificationPending: schedule.notificationPending,
        reminderSentAt: null,
        preStartSentAt: schedule.preStartSentAt,
        startSentAt: schedule.startSentAt,
        endSentAt: schedule.endSentAt,
        deliveryClaimedAt: null,
        updatedAt: now,
      };
      if (editor.id) {
        await updateTask(editor.id, payload);
      } else {
        const spot = nextCreatePosition();
        await addDoc(taskCollection, {
          ...payload,
          order: tasks.length ? Math.max(...tasks.map((task) => task.order ?? 0)) + 1 : 1,
          boardX: spot.x,
          boardY: spot.y,
          createdAt: now,
          completedAt: null,
          snoozedUntil: null,
        });
      }
      setEditorOpen(false);
      setEditor(EMPTY_EDITOR);
      const remindBits = [
        "20 min before",
        "at start",
        endAt ? "at end" : null,
      ].filter(Boolean);
      toast({
        title: editor.id ? "Note updated" : "Added to your planner",
        description: dueAt
          ? `Alerts: ${remindBits.join(", ")}.${recurrence.type !== "none" ? ` ${recurrenceLabel(recurrence)}.` : ""}`
          : "Saved without a schedule.",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not save",
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setSaving(false);
    }
  };

  const completeTask = async (task: PersonalTask) => {
    await updateTask(task.id, {
      status: "completed",
      completedAt: new Date().toISOString(),
      notificationPending: false,
      nextFireAt: null,
      reminderPhase: null,
    });
    toast({ title: "Task completed", description: "It is now available under Completed." });
  };

  const reopenTask = async (task: PersonalTask) => {
    const schedule = buildReminderSchedule({
      dueAt: task.dueAt || null,
      endAt: task.endAt || null,
      recurrence: task.recurrence,
      recurrenceUntil: task.recurrenceUntil,
      status: "todo",
    });
    await updateTask(task.id, {
      status: "todo",
      completedAt: null,
      ...schedule,
      reminderSentAt: null,
      deliveryClaimedAt: null,
    });
  };

  const snoozeTask = async (task: PersonalTask, minutes: number) => {
    const next = new Date(Date.now() + minutes * 60_000).toISOString();
    const schedule = buildReminderSchedule({
      dueAt: task.dueAt || null,
      endAt: task.endAt || null,
      recurrence: task.recurrence,
      recurrenceUntil: task.recurrenceUntil,
      status: "snoozed",
      snoozeUntil: next,
    });
    await updateTask(task.id, {
      status: "snoozed",
      snoozedUntil: next,
      ...schedule,
      reminderSentAt: null,
      deliveryClaimedAt: null,
    });
    toast({ title: "Reminder snoozed", description: `We’ll remind you ${dateTimeLabel(next)}.` });
  };

  const removeTask = async (task: PersonalTask) => {
    if (!user || !window.confirm(`Delete “${task.title}”?`)) return;
    await deleteDoc(doc(db, "users", user.uid, "personalTasks", task.id));
  };

  const enableNotifications = async () => {
    if (!user) return;
    setEnablingNotifications(true);
    try {
      if (!vapidKeyConfigured()) {
        throw new Error(
          "Background push is not configured yet. Add NEXT_PUBLIC_FIREBASE_VAPID_KEY in Vercel (Firebase Console → Project settings → Cloud Messaging → Web Push certificates), redeploy, then tap Enable reminders again."
        );
      }
      await enableCrmPushNotifications(await user.getIdToken());
      setPushReady(true);
      toast({
        title: "Reminders enabled",
        description: "This device can receive CRM task notifications even when CRM is closed.",
      });
    } catch (error) {
      setPushReady(hasCrmPushDeviceRegistered());
      toast({
        variant: "destructive",
        title: "Could not enable reminders",
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setEnablingNotifications(false);
    }
  };

  return (
    <div className="relative mx-auto min-w-0 max-w-[1500px] space-y-5 pb-10">
      <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-violet-500/15 blur-3xl" />
      <div className="pointer-events-none absolute right-0 top-20 h-80 w-80 rounded-full bg-cyan-400/10 blur-3xl" />

      <header className="relative overflow-hidden rounded-[1.75rem] border border-white/60 bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-900 p-5 text-white shadow-2xl shadow-indigo-950/15 sm:p-7">
        <div className="absolute -right-16 -top-20 h-64 w-64 rounded-full bg-fuchsia-500/20 blur-3xl" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-indigo-100 backdrop-blur">
              <Sparkles className="h-3.5 w-3.5 text-amber-300" />
              My private workspace
            </div>
            <h1 className="font-headline text-3xl font-bold tracking-tight sm:text-4xl">
              Notes & To‑Do
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-indigo-100/80 sm:text-base">
              Capture what matters, drag sticky notes anywhere on the board, and get reminded exactly when work starts.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            {!pushReady ? (
              <Button
                variant="outline"
                className="border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white"
                onClick={() => void enableNotifications()}
                disabled={enablingNotifications}
              >
                {enablingNotifications ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <BellRing className="mr-2 h-4 w-4" />
                )}
                Enable reminders
              </Button>
            ) : (
              <div className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-emerald-300/20 bg-emerald-400/15 px-4 text-sm font-semibold text-emerald-100">
                <Bell className="h-4 w-4" />
                Reminders on
              </div>
            )}
            <Button
              className="bg-white text-indigo-950 shadow-lg hover:bg-indigo-50"
              onClick={openCreate}
            >
              <Plus className="mr-2 h-4 w-4" />
              New note
            </Button>
          </div>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Current", value: counts.current, icon: Circle, tone: "text-indigo-600" },
          { label: "Due today", value: counts.today, icon: CalendarClock, tone: "text-cyan-600" },
          { label: "Overdue", value: counts.overdue, icon: Zap, tone: "text-red-600" },
          { label: "Completed", value: counts.completed, icon: CheckCircle2, tone: "text-emerald-600" },
        ].map(({ label, value, icon: Icon, tone }) => (
          <Card key={label} className="overflow-hidden border-white/70 bg-white/80 shadow-sm backdrop-blur">
            <CardContent className="flex items-center justify-between p-4 sm:p-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
                <p className="mt-1 text-2xl font-bold tabular-nums sm:text-3xl">{value}</p>
              </div>
              <div className={cn("rounded-2xl bg-muted/70 p-3", tone)}>
                <Icon className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="relative rounded-[1.5rem] border bg-white/75 p-3 shadow-sm backdrop-blur sm:p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">
            {FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setFilter(item.id)}
                className={cn(
                  "shrink-0 rounded-lg px-3 py-2 text-xs font-semibold transition-all sm:text-sm",
                  filter === item.id
                    ? "bg-white text-indigo-700 shadow-sm ring-1 ring-black/5"
                    : "text-slate-600 hover:text-slate-950"
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative min-w-0 sm:w-72">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search notes, tags…"
                className="h-10 bg-white pl-9"
              />
              {search ? (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>
            <Select
              value={priorityFilter}
              onValueChange={(value) => setPriorityFilter(value as PersonalTaskPriority | "all")}
            >
              <SelectTrigger className="h-10 bg-white sm:w-44">
                <ListFilter className="mr-2 h-4 w-4" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All priorities</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      {loading ? (
        <div className="flex min-h-72 items-center justify-center rounded-[1.5rem] border border-dashed bg-white/50">
          <Loader2 className="h-7 w-7 animate-spin text-indigo-600" />
        </div>
      ) : visibleTasks.length === 0 ? (
        <div className="flex min-h-80 flex-col items-center justify-center rounded-[1.5rem] border border-dashed border-indigo-200 bg-gradient-to-br from-white/80 to-indigo-50/60 p-8 text-center">
          <div className="rounded-3xl bg-indigo-100 p-5 text-indigo-600 shadow-inner">
            <LayoutGrid className="h-9 w-9" />
          </div>
          <h2 className="mt-5 font-headline text-xl font-bold">
            {filter === "completed" ? "No completed tasks yet" : "Your board is ready"}
          </h2>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            {filter === "completed"
              ? "Completed notes will stay safely stored here."
              : "Add your first sticky note and set a time. We’ll remind you when it starts."}
          </p>
          {filter !== "completed" ? (
            <Button className="mt-5" onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Create first note
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="overflow-hidden rounded-[1.5rem] border border-amber-900/10 bg-[#f6efd9] shadow-inner">
          <div className="flex items-center justify-between gap-3 border-b border-amber-900/10 bg-[#efe4c4]/80 px-4 py-2.5 text-xs font-semibold text-amber-950/70 sm:px-5">
            <span className="inline-flex items-center gap-1.5">
              <Move className="h-3.5 w-3.5" />
              Drag notes anywhere — your layout is saved automatically
            </span>
            <span className="hidden sm:inline">{visibleTasks.length} on board</span>
          </div>
          <div
            ref={boardRef}
            className="relative w-full overflow-auto"
            style={{
              minHeight: boardHeight,
              backgroundImage:
                "radial-gradient(rgba(120, 83, 40, 0.12) 1px, transparent 1px)",
              backgroundSize: "18px 18px",
            }}
          >
            {visibleTasks.map((task, index) => {
              const point = positions[task.id] ?? resolveBoardPosition(task, index);
              return (
                <FreeStickyNote
                  key={task.id}
                  task={task}
                  x={point.x}
                  y={point.y}
                  zIndex={draggingId === task.id ? 50 : 10 + index}
                  isDragging={draggingId === task.id}
                  onPointerDown={handleNotePointerDown}
                  onContentClick={handleNoteContentClick}
                  onComplete={(item) => void completeTask(item)}
                  onEdit={openEdit}
                  onDelete={(item) => void removeTask(item)}
                  onSnooze={(item, minutes) => void snoozeTask(item, minutes)}
                  onReopen={(item) => void reopenTask(item)}
                />
              );
            })}
          </div>
        </div>
      )}

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-h-[92dvh] w-[calc(100%-1.5rem)] overflow-y-auto border-0 p-0 shadow-2xl sm:max-w-xl">
          <div className="bg-gradient-to-br from-indigo-950 via-violet-900 to-fuchsia-800 px-6 py-5 text-white">
            <DialogHeader>
              <DialogTitle className="font-headline text-xl">
                {editor.id ? "Edit sticky note" : "Create a new note"}
              </DialogTitle>
              <DialogDescription className="text-indigo-100/80">
                Set start & end times. You’ll get alerts 20 minutes before, at start, and at end.
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="space-y-5 px-6 py-5">
            <div className="space-y-2">
              <Label htmlFor="task-title">What do you need to do?</Label>
              <Input
                id="task-title"
                value={editor.title}
                onChange={(event) => setEditor((current) => ({ ...current, title: event.target.value }))}
                placeholder="Call the new lead, review proposal…"
                className="h-11 text-base"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="task-notes">Notes</Label>
              <Textarea
                id="task-notes"
                value={editor.notes}
                onChange={(event) => setEditor((current) => ({ ...current, notes: event.target.value }))}
                placeholder="Add details, links, or a quick checklist…"
                className="min-h-28 resize-y"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="task-due">Start date & time</Label>
                <Input
                  id="task-due"
                  type="datetime-local"
                  value={editor.dueAt}
                  onChange={(event) => {
                    const dueAt = event.target.value;
                    setEditor((current) => {
                      let endAt = current.endAt;
                      if (dueAt && (!endAt || endAt <= dueAt)) {
                        const start = new Date(dueAt);
                        if (!Number.isNaN(start.getTime())) {
                          endAt = toDateTimeLocal(
                            new Date(start.getTime() + 30 * 60_000).toISOString()
                          );
                        }
                      }
                      return { ...current, dueAt, endAt };
                    });
                  }}
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="task-end">End date & time</Label>
                <Input
                  id="task-end"
                  type="datetime-local"
                  value={editor.endAt}
                  onChange={(event) =>
                    setEditor((current) => ({ ...current, endAt: event.target.value }))
                  }
                  className="h-11"
                />
              </div>
            </div>

            <div className="space-y-3 rounded-xl border bg-slate-50/80 p-3.5">
              <div className="space-y-2">
                <Label>Repeat</Label>
                <Select
                  value={editor.recurrenceType}
                  onValueChange={(value) =>
                    setEditor((current) => ({
                      ...current,
                      recurrenceType: value as EditorState["recurrenceType"],
                    }))
                  }
                >
                  <SelectTrigger className="h-11 bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Does not repeat</SelectItem>
                    <SelectItem value="daily">Every day</SelectItem>
                    <SelectItem value="weekly">Specific days each week</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {editor.recurrenceType === "weekly" ? (
                <div className="space-y-2">
                  <Label>Days of the week</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {WEEKDAY_OPTIONS.map((day) => {
                      const on = editor.weekdays.includes(day.value);
                      return (
                        <button
                          key={day.value}
                          type="button"
                          onClick={() =>
                            setEditor((current) => ({
                              ...current,
                              weekdays: on
                                ? current.weekdays.filter((d) => d !== day.value)
                                : [...current.weekdays, day.value].sort((a, b) => a - b),
                            }))
                          }
                          className={cn(
                            "h-9 min-w-10 rounded-full px-2.5 text-xs font-bold transition",
                            on
                              ? "bg-indigo-700 text-white shadow-sm"
                              : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100"
                          )}
                        >
                          {day.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
              {editor.recurrenceType !== "none" ? (
                <div className="space-y-2">
                  <Label htmlFor="task-until">Repeat until (optional)</Label>
                  <Input
                    id="task-until"
                    type="date"
                    value={editor.recurrenceUntil}
                    onChange={(event) =>
                      setEditor((current) => ({
                        ...current,
                        recurrenceUntil: event.target.value,
                      }))
                    }
                    className="h-11 bg-white"
                  />
                </div>
              ) : null}
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Notifications: <strong>20 minutes before</strong> start, <strong>when it starts</strong>
                , and <strong>when it ends</strong>. Enable reminders on this device if you haven’t.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label>Priority</Label>
                <Select
                  value={editor.priority}
                  onValueChange={(value) =>
                    setEditor((current) => ({
                      ...current,
                      priority: value as PersonalTaskPriority,
                    }))
                  }
                >
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="task-tags">Tags</Label>
              <Input
                id="task-tags"
                value={editor.tags}
                onChange={(event) => setEditor((current) => ({ ...current, tags: event.target.value }))}
                placeholder="sales, follow-up, finance"
              />
              <p className="text-xs text-muted-foreground">Separate tags with commas.</p>
            </div>
            <div className="space-y-2">
              <Label>Note color</Label>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {(Object.keys(TASK_COLORS) as PersonalTaskColor[]).map((colorId) => {
                  const color = TASK_COLORS[colorId];
                  return (
                    <button
                      key={colorId}
                      type="button"
                      onClick={() => setEditor((current) => ({ ...current, color: colorId }))}
                      className={cn(
                        "flex flex-col items-center gap-1.5 rounded-xl border p-2 text-[10px] font-semibold transition",
                        color.card,
                        editor.color === colorId
                          ? "ring-2 ring-indigo-600 ring-offset-2"
                          : "hover:scale-105"
                      )}
                    >
                      <span className={cn("h-5 w-5 rounded-full shadow-sm", color.dot)} />
                      {color.label}
                    </button>
                  );
                })}
              </div>
            </div>
            {editor.id ? (
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={editor.status}
                  onValueChange={(value) =>
                    setEditor((current) => ({ ...current, status: value as PersonalTaskStatus }))
                  }
                >
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todo">To do</SelectItem>
                    <SelectItem value="in_progress">In progress</SelectItem>
                    <SelectItem value="snoozed">Snoozed</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>
          <DialogFooter className="border-t bg-slate-50 px-6 py-4">
            <Button variant="outline" onClick={() => setEditorOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => void saveTask()}
              disabled={saving || !editor.title.trim()}
              className="bg-indigo-700 hover:bg-indigo-800"
            >
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {editor.id ? "Save changes" : "Add to planner"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

