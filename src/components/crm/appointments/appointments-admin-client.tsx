"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CalendarDays,
  Copy,
  ExternalLink,
  Link2,
  Loader2,
  Plus,
  RefreshCw,
  Unplug,
} from "lucide-react";
import type { AppointmentScheduleConfig, WeekdayKey } from "@/lib/appointments/types";
import {
  APPOINTMENT_TIMEZONES,
  DEFAULT_SCHEDULE,
  WORK_WEEK_DAYS,
} from "@/lib/appointments/types";
import { AppointmentCalendarView } from "@/components/crm/appointments/appointment-calendar-view";

type AdminSettings = {
  connected: boolean;
  googleEmail: string | null;
  calendarId: string | null;
  calendarSummary: string | null;
  calendarCreatedByUs: boolean;
  connectedAt: string | null;
  schedule: AppointmentScheduleConfig;
};

type CalendarOption = { id: string; summary: string; primary?: boolean };

type BookingRow = {
  id: string;
  guestName: string;
  guestEmail: string;
  startAt: string;
  hangoutLink: string | null;
  googleHtmlLink: string | null;
  status: string;
};

export function AppointmentsAdminClient() {
  const { user } = useAuth();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [schedule, setSchedule] = useState<AppointmentScheduleConfig>(DEFAULT_SCHEDULE);
  const [calendars, setCalendars] = useState<CalendarOption[]>([]);
  const [selectedCalendarId, setSelectedCalendarId] = useState("");
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [newCalendarName, setNewCalendarName] = useState("PrepCorex Appointments");
  const [bulkStart, setBulkStart] = useState("09:00");
  const [bulkEnd, setBulkEnd] = useState("17:00");

  const authHeader = useCallback(async () => {
    const token = await user?.getIdToken();
    if (!token) throw new Error("Sign in required");
    return { Authorization: `Bearer ${token}` };
  }, [user]);

  const publicUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/book/${schedule.slug || "prepcorex"}`;
  }, [schedule.slug]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const headers = await authHeader();
      const [settingsRes, bookingsRes] = await Promise.all([
        fetch("/api/appointments/settings", { headers }),
        fetch("/api/appointments/bookings?limit=30", { headers }),
      ]);
      const settingsJson = await settingsRes.json();
      if (!settingsRes.ok) throw new Error(settingsJson.error || "Failed to load settings");
      setSettings(settingsJson);
      setSchedule(settingsJson.schedule || DEFAULT_SCHEDULE);
      setSelectedCalendarId(settingsJson.calendarId || "");

      const bookingsJson = await bookingsRes.json();
      if (bookingsRes.ok) setBookings(bookingsJson.bookings || []);

      if (settingsJson.connected) {
        const calRes = await fetch("/api/appointments/google/calendars", { headers });
        const calJson = await calRes.json();
        if (calRes.ok) {
          setCalendars(calJson.calendars || []);
          setSelectedCalendarId(calJson.selectedCalendarId || settingsJson.calendarId || "");
        }
      }
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Could not load appointments",
        description: e instanceof Error ? e.message : "Try again",
      });
    } finally {
      setLoading(false);
    }
  }, [user, authHeader, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const g = searchParams.get("google");
    if (g === "connected") {
      toast({ title: "Google Calendar connected" });
      void load();
    } else if (g === "error") {
      toast({
        variant: "destructive",
        title: "Google connect failed",
        description: searchParams.get("message") || "Try again",
      });
    }
  }, [searchParams, toast, load]);

  async function connectGoogle() {
    try {
      const headers = await authHeader();
      const res = await fetch("/api/appointments/google/auth", { headers });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Auth failed");
      window.location.href = json.authUrl;
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Connect failed",
        description: e instanceof Error ? e.message : "Check GOOGLE_CALENDAR_CLIENT_ID",
      });
    }
  }

  async function disconnectGoogle() {
    setSaving(true);
    try {
      const headers = await authHeader();
      const res = await fetch("/api/appointments/settings", { method: "DELETE", headers });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Disconnect failed");
      setSettings(json);
      setCalendars([]);
      toast({ title: "Google Calendar disconnected" });
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Disconnect failed",
        description: e instanceof Error ? e.message : "Try again",
      });
    } finally {
      setSaving(false);
    }
  }

  async function selectCalendar() {
    if (!selectedCalendarId) return;
    setSaving(true);
    try {
      const headers = await authHeader();
      const res = await fetch("/api/appointments/google/calendars", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ calendarId: selectedCalendarId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not select calendar");
      toast({
        title: "Calendar selected",
        description: `${json.calendarSummary} — bookings will appear here and on your phone.`,
      });
      await load();
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Select failed",
        description: e instanceof Error ? e.message : "Try again",
      });
    } finally {
      setSaving(false);
    }
  }

  async function createCalendar() {
    setSaving(true);
    try {
      const headers = await authHeader();
      const res = await fetch("/api/appointments/google/calendars", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ create: true, summary: newCalendarName }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not create calendar");
      toast({
        title: "Calendar created",
        description: `"${json.calendarSummary}" is ready for appointments.`,
      });
      await load();
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Create failed",
        description: e instanceof Error ? e.message : "Try again",
      });
    } finally {
      setSaving(false);
    }
  }

  async function saveSchedule() {
    setSaving(true);
    try {
      const headers = await authHeader();
      const res = await fetch("/api/appointments/settings", {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ schedule }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save failed");
      setSettings(json);
      setSchedule(json.schedule);
      toast({ title: "Schedule saved" });
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Save failed",
        description: e instanceof Error ? e.message : "Try again",
      });
    } finally {
      setSaving(false);
    }
  }

  function copyLink() {
    void navigator.clipboard.writeText(publicUrl);
    toast({ title: "Booking link copied" });
  }

  function dayHours(day: WeekdayKey): { enabled: boolean; start: string; end: string } {
    const ranges = schedule.workingHours[day] || [];
    const first = ranges[0];
    if (!first) return { enabled: false, start: "09:00", end: "17:00" };
    return { enabled: true, start: first.start || "09:00", end: first.end || "17:00" };
  }

  function setDayEnabled(day: WeekdayKey, enabled: boolean) {
    setSchedule((s) => {
      const next = { ...s.workingHours };
      if (!enabled) {
        delete next[day];
      } else {
        const prev = s.workingHours[day]?.[0];
        next[day] = [{ start: prev?.start || "09:00", end: prev?.end || "17:00" }];
      }
      return { ...s, workingHours: next };
    });
  }

  function setDayRange(day: WeekdayKey, field: "start" | "end", value: string) {
    setSchedule((s) => {
      const prev = s.workingHours[day]?.[0] || { start: "09:00", end: "17:00" };
      return {
        ...s,
        workingHours: {
          ...s.workingHours,
          [day]: [{ ...prev, [field]: value }],
        },
      };
    });
  }

  function applyHoursToAllWeekdays() {
    const start = bulkStart || "09:00";
    const end = bulkEnd || "17:00";
    setSchedule((s) => {
      const next = { ...s.workingHours };
      for (const d of WORK_WEEK_DAYS) {
        next[d.key] = [{ start, end }];
      }
      return { ...s, workingHours: next };
    });
    toast({ title: "Applied to Mon–Fri", description: `${start} – ${end}` });
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="font-headline text-3xl font-bold tracking-tight">Appointments</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Google Workspace–style booking page powered by Calendar API. When a guest books, the
          event is created on your company Google Calendar and syncs to phone/desktop like any
          other meeting.
        </p>
      </div>

      {settings?.connected && settings.calendarId ? (
        <AppointmentCalendarView
          enabled
          calendarSummary={settings.calendarSummary}
          timezone={schedule.timezone || "America/New_York"}
          getAuthHeaders={authHeader}
        />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <CalendarDays className="h-5 w-5" />
            Google Calendar connection
          </CardTitle>
          <CardDescription>
            Connect one company Google account, then choose which calendar receives bookings —
            reuse an existing calendar or create a new “Appointments” calendar.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {settings?.connected ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">Connected</Badge>
                <span className="text-sm">{settings.googleEmail || "Google account"}</span>
                {settings.calendarSummary ? (
                  <span className="text-sm text-muted-foreground">
                    · Calendar: {settings.calendarSummary}
                  </span>
                ) : null}
              </div>

              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <div className="space-y-1.5">
                  <Label>Use existing calendar</Label>
                  <Select value={selectedCalendarId} onValueChange={setSelectedCalendarId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select calendar" />
                    </SelectTrigger>
                    <SelectContent>
                      {calendars.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.summary}
                          {c.primary ? " (primary)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button type="button" disabled={saving} onClick={() => void selectCalendar()}>
                    Use selected
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <div className="space-y-1.5">
                  <Label>Or create a new calendar</Label>
                  <Input
                    value={newCalendarName}
                    onChange={(e) => setNewCalendarName(e.target.value)}
                    placeholder="PrepCorex Appointments"
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={saving}
                    onClick={() => void createCalendar()}
                  >
                    <Plus className="mr-1.5 h-4 w-4" />
                    Create
                  </Button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
                  <RefreshCw className="mr-1.5 h-4 w-4" />
                  Refresh
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={saving}
                  onClick={() => void disconnectGoogle()}
                >
                  <Unplug className="mr-1.5 h-4 w-4" />
                  Disconnect
                </Button>
              </div>
            </>
          ) : (
            <Button type="button" onClick={() => void connectGoogle()}>
              Connect Google Calendar
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Booking page settings</CardTitle>
          <CardDescription>
            Same ideas as Google Appointment schedules: title, length, buffers, and public link.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
            <div>
              <p className="text-sm font-medium">Enable public booking</p>
              <p className="text-xs text-muted-foreground">Guests can open the link only when on.</p>
            </div>
            <Switch
              checked={schedule.enabled}
              onCheckedChange={(v) => setSchedule((s) => ({ ...s, enabled: v }))}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Title</Label>
              <Input
                value={schedule.title}
                onChange={(e) => setSchedule((s) => ({ ...s, title: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Description</Label>
              <Textarea
                rows={3}
                value={schedule.description}
                onChange={(e) => setSchedule((s) => ({ ...s, description: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Public URL slug</Label>
              <Input
                value={schedule.slug}
                onChange={(e) =>
                  setSchedule((s) => ({
                    ...s,
                    slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
                  }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Duration (minutes)</Label>
              <Input
                type="number"
                min={5}
                max={180}
                value={schedule.durationMinutes}
                onChange={(e) =>
                  setSchedule((s) => ({
                    ...s,
                    durationMinutes: Number(e.target.value) || 30,
                  }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Timezone</Label>
              <Select
                value={schedule.timezone}
                onValueChange={(v) => setSchedule((s) => ({ ...s, timezone: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select timezone" />
                </SelectTrigger>
                <SelectContent>
                  {APPOINTMENT_TIMEZONES.map((tz) => (
                    <SelectItem key={tz.value} value={tz.value}>
                      {tz.label}
                    </SelectItem>
                  ))}
                  {!APPOINTMENT_TIMEZONES.some((tz) => tz.value === schedule.timezone) &&
                  schedule.timezone ? (
                    <SelectItem value={schedule.timezone}>{schedule.timezone}</SelectItem>
                  ) : null}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Location type</Label>
              <Select
                value={schedule.locationType}
                onValueChange={(v) =>
                  setSchedule((s) => ({
                    ...s,
                    locationType: v as AppointmentScheduleConfig["locationType"],
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="google_meet">Google Meet</SelectItem>
                  <SelectItem value="phone">Phone</SelectItem>
                  <SelectItem value="in_person">In person</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {schedule.locationType !== "google_meet" ? (
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Location / phone details</Label>
                <Input
                  value={schedule.locationText}
                  onChange={(e) => setSchedule((s) => ({ ...s, locationText: e.target.value }))}
                />
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label>Buffer after (minutes)</Label>
              <Input
                type="number"
                min={0}
                value={schedule.bufferAfterMinutes}
                onChange={(e) =>
                  setSchedule((s) => ({
                    ...s,
                    bufferAfterMinutes: Number(e.target.value) || 0,
                  }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Min notice (hours)</Label>
              <Input
                type="number"
                min={0}
                value={schedule.minNoticeHours}
                onChange={(e) =>
                  setSchedule((s) => ({
                    ...s,
                    minNoticeHours: Number(e.target.value) || 0,
                  }))
                }
              />
              <p className="text-[11px] text-muted-foreground">
                Guests cannot book a slot that starts sooner than this many hours from now. Example:
                if set to 2 and it is 3:00 PM, the earliest bookable time is 5:00 PM.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Bookable days ahead</Label>
              <Input
                type="number"
                min={1}
                max={90}
                value={schedule.maxDaysAhead}
                onChange={(e) =>
                  setSchedule((s) => ({
                    ...s,
                    maxDaysAhead: Number(e.target.value) || 28,
                  }))
                }
              />
              <p className="text-[11px] text-muted-foreground">
                How far into the future the calendar stays open. Example: 28 means guests can pick
                today through about 4 weeks ahead — not months later.
              </p>
            </div>
          </div>

          <div className="space-y-3 rounded-xl border p-3">
            <div>
              <p className="text-sm font-medium">Available hours</p>
              <p className="text-xs text-muted-foreground">
                Turn days on/off and set start–end for each weekday, or apply one range to all Mon–Fri.
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-muted/20 p-2.5">
              <div className="space-y-1">
                <Label className="text-xs">Start</Label>
                <Input
                  type="time"
                  className="h-9 w-[8.5rem]"
                  value={bulkStart}
                  onChange={(e) => setBulkStart(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">End</Label>
                <Input
                  type="time"
                  className="h-9 w-[8.5rem]"
                  value={bulkEnd}
                  onChange={(e) => setBulkEnd(e.target.value)}
                />
              </div>
              <Button type="button" variant="secondary" size="sm" onClick={applyHoursToAllWeekdays}>
                Apply to all Mon–Fri
              </Button>
            </div>
            <div className="space-y-2">
              {WORK_WEEK_DAYS.map((d) => {
                const hours = dayHours(d.key);
                return (
                  <div
                    key={d.key}
                    className="grid grid-cols-[6.5rem_auto_1fr_1fr] items-center gap-2 rounded-lg border px-2.5 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={hours.enabled}
                        onCheckedChange={(v) => setDayEnabled(d.key, v)}
                      />
                      <span className="text-sm font-medium">{d.label.slice(0, 3)}</span>
                    </div>
                    <span className="hidden text-xs text-muted-foreground sm:inline">
                      {hours.enabled ? "Open" : "Closed"}
                    </span>
                    <Input
                      type="time"
                      className="h-9"
                      disabled={!hours.enabled}
                      value={hours.start}
                      onChange={(e) => setDayRange(d.key, "start", e.target.value)}
                    />
                    <Input
                      type="time"
                      className="h-9"
                      disabled={!hours.enabled}
                      value={hours.end}
                      onChange={(e) => setDayRange(d.key, "end", e.target.value)}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
            <Link2 className="h-4 w-4 text-muted-foreground" />
            <code className="min-w-0 flex-1 truncate text-xs">{publicUrl}</code>
            <Button type="button" size="sm" variant="outline" onClick={copyLink}>
              <Copy className="mr-1 h-3.5 w-3.5" />
              Copy
            </Button>
            <Button type="button" size="sm" variant="ghost" asChild>
              <a href={publicUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="mr-1 h-3.5 w-3.5" />
                Open
              </a>
            </Button>
          </div>

          <Button type="button" disabled={saving} onClick={() => void saveSchedule()}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Save schedule
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent bookings</CardTitle>
          <CardDescription>
            Also visible on the selected Google Calendar (mobile sync included).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {bookings.length === 0 ? (
            <p className="text-sm text-muted-foreground">No bookings yet.</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {bookings.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{b.guestName}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {b.guestEmail} · {new Date(b.startAt).toLocaleString()}
                    </p>
                  </div>
                  {b.googleHtmlLink ? (
                    <a
                      className="text-xs text-primary underline"
                      href={b.googleHtmlLink}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open in Google
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
