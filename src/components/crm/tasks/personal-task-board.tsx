"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  updateDoc,
} from "firebase/firestore";
import {
  Archive,
  Bell,
  BellRing,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  Clock3,
  GripVertical,
  LayoutGrid,
  ListFilter,
  Loader2,
  MoreHorizontal,
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
} from "@/lib/personal-tasks";
import {
  currentNotificationPermission,
  enableCrmPushNotifications,
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
  priority: PersonalTaskPriority;
  color: PersonalTaskColor;
  status: PersonalTaskStatus;
  tags: string;
};

const EMPTY_EDITOR: EditorState = {
  title: "",
  notes: "",
  dueAt: "",
  priority: "normal",
  color: "sun",
  status: "todo",
  tags: "",
};

const FILTERS: Array<{ id: TaskFilter; label: string }> = [
  { id: "current", label: "Current" },
  { id: "today", label: "Today" },
  { id: "overdue", label: "Overdue" },
  { id: "upcoming", label: "Upcoming" },
  { id: "snoozed", label: "Snoozed" },
  { id: "completed", label: "Completed" },
  { id: "all", label: "All" },
];

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

function SortableStickyNote({
  task,
  onComplete,
  onEdit,
  onDelete,
  onSnooze,
  onReopen,
}: {
  task: PersonalTask;
  onComplete: (task: PersonalTask) => void;
  onEdit: (task: PersonalTask) => void;
  onDelete: (task: PersonalTask) => void;
  onSnooze: (task: PersonalTask, minutes: number) => void;
  onReopen: (task: PersonalTask) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  });
  const overdue = isTaskOverdue(task);
  const completed = task.status === "completed";
  const color = TASK_COLORS[task.color] ?? TASK_COLORS.sun;

  return (
    <article
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "group relative flex min-h-[220px] flex-col overflow-hidden rounded-[1.35rem] border p-4 text-slate-900 shadow-[0_14px_40px_-24px_rgba(15,23,42,0.45)] ring-1 ring-white/70 transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_24px_50px_-25px_rgba(15,23,42,0.45)] sm:p-5",
        color.card,
        overdue && "ring-2 ring-red-400/70",
        completed && "opacity-75 grayscale-[.15]",
        isDragging && "z-30 scale-[1.03] rotate-1 opacity-90 shadow-2xl"
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
        <button
          type="button"
          className="mt-0.5 cursor-grab touch-none rounded-md p-1 text-slate-500/70 opacity-70 transition hover:bg-white/60 hover:text-slate-800 active:cursor-grabbing sm:opacity-0 sm:group-hover:opacity-100"
          aria-label="Drag to reorder"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-5 w-5" />
        </button>
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
        onClick={() => onEdit(task)}
        className="mt-3 min-w-0 flex-1 text-left"
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

      <div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-900/10 pt-3">
        <div className={cn("flex min-w-0 items-center gap-1.5 text-xs font-semibold", overdue ? "text-red-700" : "text-slate-600")}>
          <CalendarClock className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{dateTimeLabel(task.dueAt)}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
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

export function PersonalTaskBoard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [tasks, setTasks] = useState<PersonalTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editor, setEditor] = useState<EditorState>(EMPTY_EDITOR);
  const [filter, setFilter] = useState<TaskFilter>("current");
  const [priorityFilter, setPriorityFilter] = useState<PersonalTaskPriority | "all">("all");
  const [search, setSearch] = useState("");
  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | "unsupported"
  >("default");
  const [enablingNotifications, setEnablingNotifications] = useState(false);

  const taskCollection = useMemo(
    () => (user ? collection(db, "users", user.uid, "personalTasks") : null),
    [user]
  );

  useEffect(() => {
    setNotificationPermission(currentNotificationPermission());
  }, []);

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
    if (!user || !tasks.length) return;
    const run = async () => {
      const now = Date.now();
      for (const task of tasks) {
        if (
          !task.notificationPending ||
          task.status === "completed" ||
          task.status === "archived"
        ) {
          continue;
        }
        const reminder = taskDate(task.reminderAt || task.dueAt);
        if (!reminder || reminder.getTime() > now) continue;
        let displayed = false;
        if (Notification.permission === "granted" && "serviceWorker" in navigator) {
          const registration = await navigator.serviceWorker.ready.catch(() => null);
          if (registration) {
            await registration.showNotification(`Due now: ${task.title}`, {
              body: task.notes || "Your personal CRM task is ready.",
              icon: "/PCX Testing-11.svg",
              badge: "/PCX Testing-11.svg",
              tag: `crm-task-${task.id}`,
              requireInteraction: task.priority === "urgent",
              data: { url: `/dashboard/tasks?task=${task.id}`, taskId: task.id },
            });
            displayed = true;
          }
        }
        if (displayed) {
          await updateTask(task.id, {
            notificationPending: false,
            reminderSentAt: new Date().toISOString(),
          });
        }
      }
    };
    void run();
    const timer = window.setInterval(() => void run(), 30_000);
    return () => window.clearInterval(timer);
  }, [tasks, updateTask, user]);

  useEffect(() => {
    if (!user || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const completeId = params.get("complete");
    if (!completeId || !tasks.some((task) => task.id === completeId)) return;
    void updateTask(completeId, {
      status: "completed",
      completedAt: new Date().toISOString(),
      notificationPending: false,
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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const openCreate = () => {
    const now = new Date();
    now.setMinutes(Math.ceil(now.getMinutes() / 15) * 15, 0, 0);
    setEditor({ ...EMPTY_EDITOR, dueAt: toDateTimeLocal(now.toISOString()) });
    setEditorOpen(true);
  };

  const openEdit = (task: PersonalTask) => {
    setEditor({
      id: task.id,
      title: task.title,
      notes: task.notes ?? "",
      dueAt: toDateTimeLocal(task.dueAt),
      priority: task.priority,
      color: task.color,
      status: task.status,
      tags: (task.tags ?? []).join(", "),
    });
    setEditorOpen(true);
  };

  const saveTask = async () => {
    if (!user || !taskCollection || !editor.title.trim()) return;
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const dueAt = editor.dueAt ? new Date(editor.dueAt).toISOString() : null;
      const tags = editor.tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean)
        .slice(0, 8);
      const payload = {
        ownerUid: user.uid,
        title: editor.title.trim(),
        notes: editor.notes.trim(),
        dueAt,
        reminderAt: dueAt,
        priority: editor.priority,
        color: editor.color,
        status: editor.status,
        tags,
        notificationPending:
          !!dueAt && editor.status !== "completed" && editor.status !== "archived",
        reminderSentAt: null,
        updatedAt: now,
      };
      if (editor.id) {
        await updateTask(editor.id, payload);
      } else {
        await addDoc(taskCollection, {
          ...payload,
          order: tasks.length ? Math.max(...tasks.map((task) => task.order ?? 0)) + 1 : 1,
          createdAt: now,
          completedAt: null,
          snoozedUntil: null,
        });
      }
      setEditorOpen(false);
      setEditor(EMPTY_EDITOR);
      toast({
        title: editor.id ? "Note updated" : "Added to your planner",
        description: dueAt ? `Reminder set for ${dateTimeLabel(dueAt)}.` : "Saved without a date.",
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
    });
    toast({ title: "Task completed", description: "It is now available under Completed." });
  };

  const reopenTask = async (task: PersonalTask) => {
    const due = taskDate(task.dueAt);
    await updateTask(task.id, {
      status: "todo",
      completedAt: null,
      notificationPending: !!due && due.getTime() > Date.now(),
      reminderSentAt: null,
    });
  };

  const snoozeTask = async (task: PersonalTask, minutes: number) => {
    const next = new Date(Date.now() + minutes * 60_000).toISOString();
    await updateTask(task.id, {
      status: "snoozed",
      reminderAt: next,
      snoozedUntil: next,
      notificationPending: true,
      reminderSentAt: null,
    });
    toast({ title: "Reminder snoozed", description: `We’ll remind you ${dateTimeLabel(next)}.` });
  };

  const removeTask = async (task: PersonalTask) => {
    if (!user || !window.confirm(`Delete “${task.title}”?`)) return;
    await deleteDoc(doc(db, "users", user.uid, "personalTasks", task.id));
  };

  const handleDragEnd = async ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const oldIndex = visibleTasks.findIndex((task) => task.id === active.id);
    const newIndex = visibleTasks.findIndex((task) => task.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const moved = arrayMove(visibleTasks, oldIndex, newIndex);
    setTasks((current) => {
      const orderById = new Map(moved.map((task, index) => [task.id, index + 1]));
      return current
        .map((task) => ({ ...task, order: orderById.get(task.id) ?? task.order }))
        .sort((a, b) => a.order - b.order);
    });
    await Promise.all(moved.map((task, index) => updateTask(task.id, { order: index + 1 })));
  };

  const enableNotifications = async () => {
    if (!user) return;
    setEnablingNotifications(true);
    try {
      await enableCrmPushNotifications(await user.getIdToken());
      setNotificationPermission("granted");
      toast({
        title: "Reminders enabled",
        description: "This device can receive CRM task notifications.",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not enable reminders",
        description: error instanceof Error ? error.message : "Please try again.",
      });
      setNotificationPermission(currentNotificationPermission());
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
              Capture what matters, arrange your sticky notes, and get reminded exactly when work starts.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            {notificationPermission !== "granted" ? (
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
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={visibleTasks.map((task) => task.id)} strategy={rectSortingStrategy}>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {visibleTasks.map((task) => (
                <SortableStickyNote
                  key={task.id}
                  task={task}
                  onComplete={(item) => void completeTask(item)}
                  onEdit={openEdit}
                  onDelete={(item) => void removeTask(item)}
                  onSnooze={(item, minutes) => void snoozeTask(item, minutes)}
                  onReopen={(item) => void reopenTask(item)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-h-[92dvh] w-[calc(100%-1.5rem)] overflow-y-auto border-0 p-0 shadow-2xl sm:max-w-xl">
          <div className="bg-gradient-to-br from-indigo-950 via-violet-900 to-fuchsia-800 px-6 py-5 text-white">
            <DialogHeader>
              <DialogTitle className="font-headline text-xl">
                {editor.id ? "Edit sticky note" : "Create a new note"}
              </DialogTitle>
              <DialogDescription className="text-indigo-100/80">
                Add a start time to receive a reminder on your devices.
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
                  onChange={(event) => setEditor((current) => ({ ...current, dueAt: event.target.value }))}
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
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

