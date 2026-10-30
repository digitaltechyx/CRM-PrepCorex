"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
  differenceInMinutes,
} from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  Loader2,
  MapPin,
  RefreshCw,
  Users,
  Video,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type CalendarEventRow = {
  id: string;
  summary: string;
  description: string | null;
  location: string | null;
  status: string;
  htmlLink: string | null;
  hangoutLink: string | null;
  startIso: string;
  endIso: string;
  allDay: boolean;
  attendees: Array<{ email: string; displayName: string | null; responseStatus?: string }>;
  isPrepCorexBooking: boolean;
};

type ViewMode = "week" | "month";

const HOUR_START = 7;
const HOUR_END = 21; // exclusive display end
const PX_PER_HOUR = 56;

function eventStart(ev: CalendarEventRow): Date {
  if (ev.allDay) return startOfDay(parseISO(ev.startIso.slice(0, 10)));
  return parseISO(ev.startIso);
}

function eventEnd(ev: CalendarEventRow): Date {
  if (ev.allDay) return startOfDay(parseISO(ev.endIso.slice(0, 10)));
  return parseISO(ev.endIso);
}

function formatRange(ev: CalendarEventRow) {
  if (ev.allDay) {
    return `All day · ${format(eventStart(ev), "MMM d, yyyy")}`;
  }
  const s = eventStart(ev);
  const e = eventEnd(ev);
  if (isSameDay(s, e)) {
    return `${format(s, "EEEE, MMM d")} · ${format(s, "h:mm a")} – ${format(e, "h:mm a")}`;
  }
  return `${format(s, "MMM d, h:mm a")} – ${format(e, "MMM d, h:mm a")}`;
}

function eventsForDay(events: CalendarEventRow[], day: Date) {
  return events.filter((ev) => {
    const s = eventStart(ev);
    const e = eventEnd(ev);
    if (ev.allDay) {
      // Google all-day end is exclusive
      return day >= s && day < e;
    }
    return isSameDay(s, day) || (s < day && e > day);
  });
}

type Props = {
  getAuthHeaders: () => Promise<Record<string, string>>;
  calendarSummary: string | null;
  timezone: string;
  enabled: boolean;
};

export function AppointmentCalendarView({
  getAuthHeaders,
  calendarSummary,
  timezone,
  enabled,
}: Props) {
  const [view, setView] = useState<ViewMode>("week");
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [events, setEvents] = useState<CalendarEventRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<CalendarEventRow | null>(null);

  const range = useMemo(() => {
    if (view === "week") {
      const start = startOfWeek(anchor, { weekStartsOn: 0 });
      const end = endOfWeek(anchor, { weekStartsOn: 0 });
      return { start, end: addDays(end, 1) }; // exclusive end for API buffer
    }
    const monthStart = startOfMonth(anchor);
    const monthEnd = endOfMonth(anchor);
    const start = startOfWeek(monthStart, { weekStartsOn: 0 });
    const end = endOfWeek(monthEnd, { weekStartsOn: 0 });
    return { start, end: addDays(end, 1) };
  }, [anchor, view]);

  const days = useMemo(() => {
    if (view === "week") {
      return eachDayOfInterval({
        start: startOfWeek(anchor, { weekStartsOn: 0 }),
        end: endOfWeek(anchor, { weekStartsOn: 0 }),
      });
    }
    return eachDayOfInterval({
      start: startOfWeek(startOfMonth(anchor), { weekStartsOn: 0 }),
      end: endOfWeek(endOfMonth(anchor), { weekStartsOn: 0 }),
    });
  }, [anchor, view]);

  const loadEvents = useCallback(async () => {
    if (!enabled) {
      setEvents([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const qs = new URLSearchParams({
        timeMin: range.start.toISOString(),
        timeMax: range.end.toISOString(),
        timezone,
      });
      const res = await fetch(`/api/appointments/google/events?${qs}`, { headers });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not load calendar");
      setEvents(json.events || []);
    } catch (e) {
      setEvents([]);
      setError(e instanceof Error ? e.message : "Could not load calendar");
    } finally {
      setLoading(false);
    }
  }, [enabled, getAuthHeaders, range.end, range.start, timezone]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  const title = useMemo(() => {
    if (view === "week") {
      const start = startOfWeek(anchor, { weekStartsOn: 0 });
      const end = endOfWeek(anchor, { weekStartsOn: 0 });
      if (start.getMonth() === end.getMonth()) {
        return format(start, "MMMM yyyy");
      }
      return `${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")}`;
    }
    return format(anchor, "MMMM yyyy");
  }, [anchor, view]);

  const hours = useMemo(
    () => Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i),
    []
  );

  if (!enabled) {
    return (
      <div className="rounded-xl border border-dashed bg-muted/30 px-4 py-10 text-center text-sm text-muted-foreground">
        Connect Google Calendar and select a calendar to see your schedule here.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="flex flex-col gap-3 border-b bg-gradient-to-r from-primary/5 via-transparent to-teal-500/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-headline text-lg font-semibold tracking-tight">Calendar</h2>
            {calendarSummary ? (
              <Badge variant="secondary" className="max-w-[200px] truncate font-normal">
                {calendarSummary}
              </Badge>
            ) : null}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Live from your selected Google Calendar · {timezone.replace(/_/g, " ")}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border bg-background p-0.5">
            <button
              type="button"
              onClick={() => setView("week")}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-semibold transition",
                view === "week" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              Week
            </button>
            <button
              type="button"
              onClick={() => setView("month")}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-semibold transition",
                view === "month" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              Month
            </button>
          </div>

          <div className="inline-flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() =>
                setAnchor((d) => (view === "week" ? addWeeks(d, -1) : addMonths(d, -1)))
              }
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => setAnchor(startOfDay(new Date()))}
            >
              Today
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() =>
                setAnchor((d) => (view === "week" ? addWeeks(d, 1) : addMonths(d, 1)))
              }
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <p className="min-w-[7.5rem] text-center text-sm font-semibold tabular-nums sm:text-left">
            {title}
          </p>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            disabled={loading}
            onClick={() => void loadEvents()}
            title="Refresh"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {error ? (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-950">
          {error}
        </div>
      ) : null}

      <div className="relative">
        {loading && events.length === 0 ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
          </div>
        ) : view === "week" ? (
          <WeekGrid
            days={days}
            hours={hours}
            events={events}
            onSelect={setSelected}
          />
        ) : (
          <MonthGrid days={days} anchor={anchor} events={events} onSelect={setSelected} />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-4 border-t bg-muted/20 px-4 py-2.5 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-primary" />
          PrepCorex booking
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-teal-600" />
          Other calendar event
        </span>
        <span className="ml-auto">{events.length} event{events.length === 1 ? "" : "s"} in view</span>
      </div>

      <EventDetailDialog event={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function WeekGrid({
  days,
  hours,
  events,
  onSelect,
}: {
  days: Date[];
  hours: number[];
  events: CalendarEventRow[];
  onSelect: (e: CalendarEventRow) => void;
}) {
  const gridHeight = hours.length * PX_PER_HOUR;

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[720px]">
        <div className="grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))] border-b">
          <div className="border-r bg-muted/10" />
          {days.map((day) => (
            <div
              key={day.toISOString()}
              className={cn(
                "border-r px-1 py-2 text-center last:border-r-0",
                isToday(day) && "bg-primary/5"
              )}
            >
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {format(day, "EEE")}
              </p>
              <p
                className={cn(
                  "mx-auto mt-0.5 flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold",
                  isToday(day) && "bg-primary text-primary-foreground"
                )}
              >
                {format(day, "d")}
              </p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))]">
          <div className="relative border-r" style={{ height: gridHeight }}>
            {hours.map((h) => (
              <div
                key={h}
                className="absolute right-1 -translate-y-1/2 text-[10px] tabular-nums text-muted-foreground"
                style={{ top: (h - HOUR_START) * PX_PER_HOUR }}
              >
                {format(new Date(2000, 0, 1, h), "h a")}
              </div>
            ))}
          </div>

          {days.map((day) => {
            const dayEvents = eventsForDay(events, day).filter((e) => !e.allDay);
            const allDay = eventsForDay(events, day).filter((e) => e.allDay);
            return (
              <div
                key={day.toISOString()}
                className={cn(
                  "relative border-r last:border-r-0",
                  isToday(day) && "bg-primary/[0.03]"
                )}
                style={{ height: gridHeight }}
              >
                {hours.map((h) => (
                  <div
                    key={h}
                    className="absolute inset-x-0 border-t border-border/60"
                    style={{ top: (h - HOUR_START) * PX_PER_HOUR, height: PX_PER_HOUR }}
                  />
                ))}

                {allDay.length > 0 ? (
                  <div className="absolute inset-x-0.5 top-0 z-10 space-y-0.5 p-0.5">
                    {allDay.slice(0, 2).map((ev) => (
                      <button
                        key={ev.id}
                        type="button"
                        onClick={() => onSelect(ev)}
                        className={cn(
                          "block w-full truncate rounded px-1 py-0.5 text-left text-[10px] font-semibold text-white",
                          ev.isPrepCorexBooking ? "bg-primary" : "bg-teal-600"
                        )}
                      >
                        {ev.summary}
                      </button>
                    ))}
                  </div>
                ) : null}

                {dayEvents.map((ev) => {
                  const s = eventStart(ev);
                  const e = eventEnd(ev);
                  const startMinutes = s.getHours() * 60 + s.getMinutes();
                  const base = HOUR_START * 60;
                  const top = ((startMinutes - base) / 60) * PX_PER_HOUR;
                  const duration = Math.max(30, differenceInMinutes(e, s));
                  const height = (duration / 60) * PX_PER_HOUR;
                  if (startMinutes < base || startMinutes >= HOUR_END * 60) return null;
                  return (
                    <button
                      key={ev.id}
                      type="button"
                      onClick={() => onSelect(ev)}
                      className={cn(
                        "absolute inset-x-0.5 z-20 overflow-hidden rounded-md border px-1.5 py-1 text-left shadow-sm transition hover:brightness-95",
                        ev.isPrepCorexBooking
                          ? "border-primary/30 bg-primary text-primary-foreground"
                          : "border-teal-700/20 bg-teal-600 text-white"
                      )}
                      style={{
                        top: Math.max(0, top),
                        height: Math.max(22, Math.min(height, gridHeight - Math.max(0, top))),
                      }}
                      title={ev.summary}
                    >
                      <p className="truncate text-[11px] font-semibold leading-tight">{ev.summary}</p>
                      <p className="truncate text-[10px] opacity-90">
                        {format(s, "h:mm a")}
                      </p>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MonthGrid({
  days,
  anchor,
  events,
  onSelect,
}: {
  days: Date[];
  anchor: Date;
  events: CalendarEventRow[];
  onSelect: (e: CalendarEventRow) => void;
}) {
  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[640px]">
        <div className="grid grid-cols-7 border-b bg-muted/20">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div
              key={d}
              className="border-r px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground last:border-r-0"
            >
              {d}
            </div>
          ))}
        </div>
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 border-b last:border-b-0">
            {week.map((day) => {
              const dayEvents = eventsForDay(events, day);
              const inMonth = isSameMonth(day, anchor);
              return (
                <div
                  key={day.toISOString()}
                  className={cn(
                    "min-h-[100px] border-r p-1.5 last:border-r-0",
                    !inMonth && "bg-muted/30",
                    isToday(day) && "bg-primary/[0.04]"
                  )}
                >
                  <p
                    className={cn(
                      "mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
                      isToday(day) && "bg-primary text-primary-foreground",
                      !inMonth && "text-muted-foreground"
                    )}
                  >
                    {format(day, "d")}
                  </p>
                  <div className="space-y-0.5">
                    {dayEvents.slice(0, 3).map((ev) => (
                      <button
                        key={ev.id}
                        type="button"
                        onClick={() => onSelect(ev)}
                        className={cn(
                          "block w-full truncate rounded px-1 py-0.5 text-left text-[10px] font-medium text-white",
                          ev.isPrepCorexBooking ? "bg-primary" : "bg-teal-600"
                        )}
                      >
                        {!ev.allDay ? `${format(eventStart(ev), "h:mma")} ` : ""}
                        {ev.summary}
                      </button>
                    ))}
                    {dayEvents.length > 3 ? (
                      <p className="px-1 text-[10px] font-medium text-muted-foreground">
                        +{dayEvents.length - 3} more
                      </p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function EventDetailDialog({
  event,
  onClose,
}: {
  event: CalendarEventRow | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={Boolean(event)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md gap-0 overflow-hidden p-0 sm:rounded-2xl">
        {event ? (
          <>
            <div
              className={cn(
                "px-5 pb-4 pt-5 text-white",
                event.isPrepCorexBooking
                  ? "bg-gradient-to-br from-primary to-primary/80"
                  : "bg-gradient-to-br from-teal-700 to-teal-600"
              )}
            >
              <DialogHeader className="space-y-1 text-left">
                <div className="flex flex-wrap gap-1.5">
                  {event.isPrepCorexBooking ? (
                    <Badge className="border-0 bg-white/20 text-white hover:bg-white/20">
                      PrepCorex booking
                    </Badge>
                  ) : (
                    <Badge className="border-0 bg-white/20 text-white hover:bg-white/20">
                      Calendar event
                    </Badge>
                  )}
                  {event.status !== "confirmed" ? (
                    <Badge variant="secondary" className="capitalize">
                      {event.status}
                    </Badge>
                  ) : null}
                </div>
                <DialogTitle className="text-xl text-white">{event.summary}</DialogTitle>
                <DialogDescription className="text-white/80">
                  {formatRange(event)}
                </DialogDescription>
              </DialogHeader>
            </div>

            <div className="space-y-4 px-5 py-4 text-sm">
              <div className="flex items-start gap-3">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="font-medium">{formatRange(event)}</p>
                </div>
              </div>

              {event.location ? (
                <div className="flex items-start gap-3">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <p>{event.location}</p>
                </div>
              ) : null}

              {event.attendees.length > 0 ? (
                <div className="flex items-start gap-3">
                  <Users className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <ul className="space-y-1">
                    {event.attendees.map((a) => (
                      <li key={a.email}>
                        <span className="font-medium">{a.displayName || a.email}</span>
                        {a.displayName ? (
                          <span className="text-muted-foreground"> · {a.email}</span>
                        ) : null}
                        {a.responseStatus ? (
                          <span className="ml-1 text-xs capitalize text-muted-foreground">
                            ({a.responseStatus})
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {event.description ? (
                <div className="rounded-lg border bg-muted/30 px-3 py-2.5">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Details
                  </p>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                    {event.description}
                  </p>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2 pt-1">
                {event.hangoutLink ? (
                  <Button asChild size="sm" className="gap-1.5">
                    <a href={event.hangoutLink} target="_blank" rel="noreferrer">
                      <Video className="h-3.5 w-3.5" />
                      Join Meet
                    </a>
                  </Button>
                ) : null}
                {event.htmlLink ? (
                  <Button asChild size="sm" variant="outline" className="gap-1.5">
                    <a href={event.htmlLink} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-3.5 w-3.5" />
                      Open in Google
                    </a>
                  </Button>
                ) : null}
              </div>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
