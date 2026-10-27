"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { collection, onSnapshot } from "firebase/firestore";
import { ArrowRight, CalendarCheck2, CheckCircle2, Clock3, StickyNote, Zap } from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";
import {
  TASK_COLORS,
  isTaskOverdue,
  isTaskToday,
  taskDate,
  type PersonalTask,
} from "@/lib/personal-tasks";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function compactDueLabel(value?: string | null): string {
  const date = taskDate(value);
  if (!date) return "No date";
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function PersonalTaskDashboardCard() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<PersonalTask[]>([]);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(collection(db, "users", user.uid, "personalTasks"), (snapshot) => {
      setTasks(
        snapshot.docs.map((item) => ({
          id: item.id,
          ...(item.data() as Omit<PersonalTask, "id">),
        }))
      );
    });
  }, [user]);

  const summary = useMemo(() => {
    const current = tasks.filter(
      (task) => task.status !== "completed" && task.status !== "archived"
    );
    const sorted = [...current].sort((a, b) => {
      const aDue = taskDate(a.dueAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const bDue = taskDate(b.dueAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return aDue - bDue;
    });
    return {
      today: current.filter((task) => isTaskToday(task)).length,
      overdue: current.filter((task) => isTaskOverdue(task)).length,
      completed: tasks.filter((task) => task.status === "completed").length,
      next: sorted.slice(0, 4),
    };
  }, [tasks]);

  return (
    <Card className="relative overflow-hidden border-indigo-200/70 bg-gradient-to-br from-white via-indigo-50/70 to-violet-100/60 shadow-lg shadow-indigo-950/5">
      <div className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full bg-fuchsia-400/15 blur-3xl" />
      <CardHeader className="relative flex flex-row items-start justify-between gap-3 space-y-0 pb-3">
        <div>
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-indigo-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-indigo-700">
            <StickyNote className="h-3.5 w-3.5" />
            Personal planner
          </div>
          <CardTitle className="font-headline text-xl">Today’s focus</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Your private notes and reminders, ready when you are.
          </p>
        </div>
        <Button asChild size="sm" className="shrink-0 bg-indigo-700 hover:bg-indigo-800">
          <Link href="/dashboard/tasks">
            Open planner
            <ArrowRight className="ml-1.5 h-4 w-4" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="relative grid gap-4 lg:grid-cols-[220px_1fr]">
        <div className="grid grid-cols-3 gap-2 lg:grid-cols-1">
          {[
            { label: "Today", value: summary.today, icon: CalendarCheck2, tone: "text-cyan-700 bg-cyan-100" },
            { label: "Overdue", value: summary.overdue, icon: Zap, tone: "text-red-700 bg-red-100" },
            { label: "Completed", value: summary.completed, icon: CheckCircle2, tone: "text-emerald-700 bg-emerald-100" },
          ].map(({ label, value, icon: Icon, tone }) => (
            <div key={label} className="flex items-center gap-2 rounded-xl border bg-white/70 p-2.5 shadow-sm">
              <div className={cn("hidden rounded-lg p-2 sm:block", tone)}>
                <Icon className="h-4 w-4" />
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {label}
                </p>
                <p className="text-xl font-bold tabular-nums">{value}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {summary.next.length ? (
            summary.next.map((task) => {
              const color = TASK_COLORS[task.color] ?? TASK_COLORS.sun;
              const overdue = isTaskOverdue(task);
              return (
                <Link
                  href={`/dashboard/tasks?task=${encodeURIComponent(task.id)}`}
                  key={task.id}
                  className={cn(
                    "flex min-w-0 items-start gap-3 rounded-xl border p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md",
                    color.card
                  )}
                >
                  <span className={cn("mt-1 h-2.5 w-2.5 shrink-0 rounded-full", color.dot)} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-900">{task.title}</p>
                    <p className={cn("mt-1 flex items-center gap-1 text-xs", overdue ? "font-semibold text-red-700" : "text-slate-600")}>
                      <Clock3 className="h-3 w-3" />
                      {overdue ? "Overdue · " : ""}
                      {compactDueLabel(task.dueAt)}
                    </p>
                  </div>
                </Link>
              );
            })
          ) : (
            <div className="col-span-full flex min-h-28 flex-col items-center justify-center rounded-xl border border-dashed bg-white/60 text-center">
              <Badge variant="outline">Clear schedule</Badge>
              <p className="mt-2 text-sm text-muted-foreground">Add a note when something comes up.</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

