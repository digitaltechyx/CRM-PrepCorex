"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Loader2, CheckCircle2 } from "lucide-react";
import { addDays, format, startOfDay } from "date-fns";

type ScheduleMeta = {
  slug: string;
  title: string;
  description: string;
  durationMinutes: number;
  timezone: string;
  locationType: string;
  locationText: string;
  enabled: boolean;
  maxDaysAhead: number;
};

type Slot = { startIso: string; endIso: string; label: string };

export function PublicBookingClient({ slug }: { slug: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<ScheduleMeta | null>(null);
  const [selectedDay, setSelectedDay] = useState<Date | undefined>(undefined);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{
    message: string;
    hangoutLink: string | null;
    startIso: string;
  } | null>(null);

  const maxDate = useMemo(() => {
    const ahead = schedule?.maxDaysAhead ?? 28;
    return addDays(startOfDay(new Date()), ahead);
  }, [schedule?.maxDaysAhead]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/appointments/public/${encodeURIComponent(slug)}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Not found");
        if (!cancelled) setSchedule(json.schedule);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Unavailable");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    if (!selectedDay || !schedule) {
      setSlots([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setSlotsLoading(true);
      setSelectedSlot(null);
      try {
        const date = format(selectedDay, "yyyy-MM-dd");
        const res = await fetch(
          `/api/appointments/public/${encodeURIComponent(slug)}/slots?date=${date}`
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Could not load times");
        if (!cancelled) setSlots(json.slots || []);
      } catch (e) {
        if (!cancelled) {
          setSlots([]);
          setError(e instanceof Error ? e.message : "Could not load times");
        }
      } finally {
        if (!cancelled) setSlotsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedDay, schedule, slug]);

  async function book() {
    if (!selectedSlot) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/appointments/public/${encodeURIComponent(slug)}/book`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          phone,
          notes,
          startIso: selectedSlot.startIso,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Booking failed");
      setDone({
        message: json.message || "Booked",
        hangoutLink: json.hangoutLink || null,
        startIso: json.startIso,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Booking failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
      </div>
    );
  }

  if (error && !schedule) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-50 p-6">
        <p className="text-sm text-slate-600">{error}</p>
      </div>
    );
  }

  if (!schedule) return null;

  if (done) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-gradient-to-b from-slate-50 to-white p-6">
        <div className="w-full max-w-md rounded-2xl border bg-white p-8 text-center shadow-sm">
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">You&apos;re booked</h1>
          <p className="mt-2 text-sm text-slate-600">{done.message}</p>
          <p className="mt-3 text-sm font-medium text-slate-900">
            {new Date(done.startIso).toLocaleString(undefined, {
              dateStyle: "full",
              timeStyle: "short",
            })}
          </p>
          {done.hangoutLink ? (
            <Button className="mt-6" asChild>
              <a href={done.hangoutLink} target="_blank" rel="noreferrer">
                Open Google Meet
              </a>
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-gradient-to-b from-slate-100 via-slate-50 to-white px-4 py-10">
      <div className="mx-auto grid w-full max-w-4xl gap-6 rounded-3xl border bg-white p-5 shadow-xl shadow-slate-200/60 md:grid-cols-[1.1fr_1fr] md:p-8">
        <div className="space-y-3 border-b pb-5 md:border-b-0 md:border-r md:pb-0 md:pr-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-violet-700">
            PrepCorex
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
            {schedule.title}
          </h1>
          <p className="text-sm leading-relaxed text-slate-600">{schedule.description}</p>
          <dl className="space-y-1 pt-2 text-sm text-slate-700">
            <div>
              <dt className="inline text-slate-500">Duration · </dt>
              <dd className="inline font-medium">{schedule.durationMinutes} minutes</dd>
            </div>
            <div>
              <dt className="inline text-slate-500">Timezone · </dt>
              <dd className="inline font-medium">{schedule.timezone}</dd>
            </div>
            <div>
              <dt className="inline text-slate-500">Where · </dt>
              <dd className="inline font-medium">
                {schedule.locationType === "google_meet"
                  ? "Google Meet"
                  : schedule.locationText || schedule.locationType}
              </dd>
            </div>
          </dl>
        </div>

        <div className="space-y-4 md:pl-2">
          <div>
            <Label className="text-slate-700">1. Pick a day</Label>
            <div className="mt-2 rounded-xl border p-2">
              <Calendar
                mode="single"
                selected={selectedDay}
                onSelect={setSelectedDay}
                disabled={(date) =>
                  date < startOfDay(new Date()) || date > maxDate
                }
                className="mx-auto"
              />
            </div>
          </div>

          {selectedDay ? (
            <div>
              <Label className="text-slate-700">2. Pick a time</Label>
              {slotsLoading ? (
                <div className="mt-3 flex justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                </div>
              ) : slots.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500">No open times this day.</p>
              ) : (
                <div className="mt-2 grid max-h-48 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
                  {slots.map((slot) => (
                    <button
                      key={slot.startIso}
                      type="button"
                      onClick={() => setSelectedSlot(slot)}
                      className={`rounded-lg border px-2 py-2 text-sm font-medium transition ${
                        selectedSlot?.startIso === slot.startIso
                          ? "border-violet-600 bg-violet-600 text-white"
                          : "border-slate-200 hover:border-violet-400"
                      }`}
                    >
                      {slot.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {selectedSlot ? (
            <div className="space-y-3 border-t pt-4">
              <Label className="text-slate-700">3. Your details</Label>
              <div className="space-y-1.5">
                <Label htmlFor="bk-name">Name *</Label>
                <Input id="bk-name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bk-email">Email *</Label>
                <Input
                  id="bk-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bk-phone">Phone</Label>
                <Input id="bk-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bk-notes">Notes</Label>
                <Textarea
                  id="bk-notes"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
              {error ? <p className="text-sm text-red-600">{error}</p> : null}
              <Button
                type="button"
                className="w-full"
                disabled={submitting || !name.trim() || !email.trim()}
                onClick={() => void book()}
              >
                {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Confirm {selectedSlot.label}
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
