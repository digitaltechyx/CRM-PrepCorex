"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { B_CARD_PROFILE } from "@/lib/b-card-profile";
import {
  Loader2,
  CheckCircle2,
  Clock,
  Globe2,
  Video,
  Phone,
  MapPin,
  CalendarDays,
  ArrowLeft,
  Sparkles,
} from "lucide-react";
import { addDays, format, startOfDay } from "date-fns";
import { cn } from "@/lib/utils";

/** Matches https://prepservicesfba.com theme tokens */
const PSF = {
  accent: "#ff8806",
  accentDeep: "#e07805",
  accentSoft: "rgba(255, 136, 6, 0.12)",
  ink: "#0f172a",
  muted: "#64748b",
  line: "#e8ecf1",
  wash: "#fff8f1",
  dark: "#1a1208",
  darkMid: "#2a1a0c",
} as const;

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

function locationLabel(schedule: ScheduleMeta) {
  if (schedule.locationType === "google_meet") return "Google Meet";
  if (schedule.locationType === "phone") return schedule.locationText || "Phone call";
  if (schedule.locationType === "in_person") return schedule.locationText || "In person";
  return schedule.locationText || "Custom";
}

function LocationIcon({ type }: { type: string }) {
  if (type === "google_meet") return <Video className="h-4 w-4" />;
  if (type === "phone") return <Phone className="h-4 w-4" />;
  return <MapPin className="h-4 w-4" />;
}

function timezoneDisplay(tz: string) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: "short",
    }).formatToParts(new Date());
    const short = parts.find((p) => p.type === "timeZoneName")?.value;
    return short ? `${tz.replace(/_/g, " ")} (${short})` : tz.replace(/_/g, " ");
  } catch {
    return tz.replace(/_/g, " ");
  }
}

function StepBadge({ n, active, done }: { n: number; active?: boolean; done?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
        done && "bg-emerald-600 text-white",
        active && !done && "text-white shadow-sm",
        !active && !done && "bg-slate-100 text-slate-500"
      )}
      style={active && !done ? { backgroundColor: PSF.accent, boxShadow: `0 4px 12px ${PSF.accentSoft}` } : undefined}
    >
      {done ? "✓" : n}
    </span>
  );
}

function PsfLogo({
  className,
  centered,
}: {
  className?: string;
  /** Horizontally center the logo (img is inline by default; mx-auto alone is unreliable). */
  centered?: boolean;
}) {
  const img = (
    <img
      src={B_CARD_PROFILE.companyLogoSrc}
      alt="Prep Services FBA"
      className={cn("block h-auto w-auto max-w-full object-contain", className)}
    />
  );
  if (!centered) return img;
  return <div className="flex w-full justify-center">{img}</div>;
}

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
      <div
        className="relative flex min-h-dvh items-center justify-center overflow-hidden font-outfit"
        style={{ background: `linear-gradient(90deg, ${PSF.dark} 0%, ${PSF.darkMid} 45%, ${PSF.dark} 100%)` }}
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,rgba(255,136,6,0.22),transparent_55%)]" />
        <div className="relative flex flex-col items-center gap-4">
          <PsfLogo centered className="h-14 max-w-[260px]" />
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: PSF.accent }} />
        </div>
      </div>
    );
  }

  if (error && !schedule) {
    return (
      <div
        className="flex min-h-dvh items-center justify-center p-6 font-outfit"
        style={{ background: PSF.dark }}
      >
        <div className="max-w-sm rounded-2xl border border-white/10 bg-white/5 px-6 py-8 text-center backdrop-blur">
          <PsfLogo centered className="mb-4 h-12 max-w-[220px]" />
          <p className="text-lg font-semibold text-white">Booking unavailable</p>
          <p className="mt-2 text-sm text-[#ffd7a8]/80">{error}</p>
        </div>
      </div>
    );
  }

  if (!schedule) return null;

  if (done) {
    return (
      <div
        className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-12 font-outfit"
        style={{ background: `linear-gradient(90deg, ${PSF.dark} 0%, ${PSF.darkMid} 45%, ${PSF.dark} 100%)` }}
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_40%_10%,rgba(255,136,6,0.28),transparent_50%)]" />
        <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/10 bg-white shadow-2xl shadow-black/50">
          <div
            className="px-8 pb-10 pt-8 text-center text-white"
            style={{
              background: `linear-gradient(135deg, #ff9f2e 0%, ${PSF.accent} 45%, ${PSF.accentDeep} 100%)`,
            }}
          >
            <PsfLogo centered className="h-12 max-w-[240px]" />
            <div className="mx-auto mt-6 flex h-16 w-16 items-center justify-center rounded-full bg-white/20 ring-1 ring-white/35 backdrop-blur">
              <CheckCircle2 className="h-9 w-9 text-white" />
            </div>
            <h1 className="mt-4 text-3xl font-extrabold tracking-tight">You&apos;re booked</h1>
            <p className="mt-2 text-sm text-white/90">{done.message}</p>
          </div>
          <div className="space-y-4 px-8 py-7 text-center">
            <p className="text-lg font-bold" style={{ color: PSF.ink }}>
              {new Date(done.startIso).toLocaleString(undefined, {
                dateStyle: "full",
                timeStyle: "short",
              })}
            </p>
            <p className="text-sm" style={{ color: PSF.muted }}>
              A calendar invite is on its way to your email.
            </p>
            {done.hangoutLink ? (
              <Button
                className="mt-2 h-11 w-full rounded-xl text-base font-semibold text-white hover:opacity-95"
                style={{ backgroundColor: PSF.accent }}
                asChild
              >
                <a href={done.hangoutLink} target="_blank" rel="noreferrer">
                  <Video className="mr-2 h-4 w-4" />
                  Open Google Meet
                </a>
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  const showingDetails = Boolean(selectedSlot);

  return (
    <div
      className="relative min-h-dvh overflow-x-hidden font-outfit"
      style={{ background: `linear-gradient(90deg, ${PSF.dark} 0%, ${PSF.darkMid} 45%, ${PSF.dark} 100%)` }}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_20%_0%,rgba(255,136,6,0.28),transparent_45%),radial-gradient(ellipse_at_85%_80%,rgba(224,120,5,0.18),transparent_50%)]" />

      <div className="relative mx-auto flex min-h-dvh max-w-5xl flex-col justify-center px-4 py-8 sm:px-6 lg:py-12">
        <div className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-white shadow-[0_40px_80px_-20px_rgba(0,0,0,0.55)]">
          <div className="grid lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.15fr)]">
            {/* Brand panel — website dark + orange */}
            <aside
              className="relative overflow-hidden px-7 py-8 text-white sm:px-9 sm:py-10"
              style={{
                background: `linear-gradient(160deg, ${PSF.dark} 0%, ${PSF.darkMid} 40%, #3a2418 100%)`,
              }}
            >
              <div className="pointer-events-none absolute -right-16 -top-10 h-56 w-56 rounded-full bg-orange-500/25 blur-3xl" />
              <div className="pointer-events-none absolute -bottom-24 -left-10 h-64 w-64 rounded-full bg-orange-600/15 blur-3xl" />

              <div className="relative space-y-7">
                <a
                  href={B_CARD_PROFILE.website}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block"
                  aria-label="Prep Services FBA home"
                >
                  <PsfLogo className="h-14 max-w-[260px] sm:h-16" />
                </a>

                <div>
                  <p
                    className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#ffd7a8] ring-1 ring-orange-400/30"
                    style={{ backgroundColor: "rgba(255,136,6,0.15)" }}
                  >
                    <Sparkles className="h-3 w-3" style={{ color: PSF.accent }} />
                    Schedule a call
                  </p>
                  <h1 className="mt-4 text-3xl font-extrabold leading-tight tracking-tight text-white sm:text-4xl">
                    {schedule.title}
                  </h1>
                  <p className="mt-3 max-w-sm text-sm leading-relaxed text-[#f8e6d0]/85">
                    {schedule.description}
                  </p>
                </div>

                <ul className="space-y-3">
                  {[
                    {
                      icon: <Clock className="h-4 w-4" />,
                      label: "Duration",
                      value: `${schedule.durationMinutes} minutes`,
                    },
                    {
                      icon: <Globe2 className="h-4 w-4" />,
                      label: "Timezone",
                      value: timezoneDisplay(schedule.timezone),
                    },
                    {
                      icon: <LocationIcon type={schedule.locationType} />,
                      label: "Where",
                      value: locationLabel(schedule),
                    },
                  ].map((row) => (
                    <li
                      key={row.label}
                      className="flex items-center gap-3 rounded-2xl bg-white/5 px-3.5 py-3 ring-1 ring-white/10 backdrop-blur-sm"
                    >
                      <span
                        className="flex h-9 w-9 items-center justify-center rounded-xl text-white"
                        style={{ backgroundColor: "rgba(255,136,6,0.25)" }}
                      >
                        {row.icon}
                      </span>
                      <div>
                        <p className="text-[11px] font-medium uppercase tracking-wide text-[#ffd7a8]/70">
                          {row.label}
                        </p>
                        <p className="text-sm font-semibold text-white">{row.value}</p>
                      </div>
                    </li>
                  ))}
                </ul>

                <p className="hidden text-xs text-[#f8e6d0]/45 lg:block">
                  After you confirm, we&apos;ll send a calendar invite with everything you need.
                </p>
              </div>
            </aside>

            {/* Booking flow — white + wash like website */}
            <section className="px-5 py-7 sm:px-8 sm:py-9" style={{ backgroundColor: PSF.wash }}>
              {!showingDetails ? (
                <div className="space-y-6">
                  <div>
                    <div className="mb-3 flex items-center gap-2">
                      <StepBadge n={1} active={!selectedDay} done={Boolean(selectedDay)} />
                      <h2 className="text-base font-bold" style={{ color: PSF.ink }}>
                        Pick a day
                      </h2>
                    </div>
                    <div
                      className="rounded-2xl border bg-white p-2 shadow-sm sm:p-3"
                      style={{ borderColor: PSF.line }}
                    >
                      <Calendar
                        mode="single"
                        selected={selectedDay}
                        onSelect={setSelectedDay}
                        disabled={(date) =>
                          date < startOfDay(new Date()) || date > maxDate
                        }
                        className="mx-auto"
                        classNames={{
                          caption_label: "font-outfit text-sm font-bold",
                          day_selected:
                            "text-white hover:text-white focus:text-white",
                          day_today: "font-semibold",
                          nav_button:
                            "h-8 w-8 rounded-lg border bg-white opacity-100 hover:bg-orange-50",
                        }}
                        modifiersStyles={{
                          selected: {
                            backgroundColor: PSF.accent,
                            color: "#fff",
                          },
                          today: {
                            backgroundColor: PSF.accentSoft,
                            color: PSF.accentDeep,
                          },
                        }}
                      />
                    </div>
                  </div>

                  {selectedDay ? (
                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <StepBadge n={2} active />
                          <h2 className="text-base font-bold" style={{ color: PSF.ink }}>
                            Pick a time
                          </h2>
                        </div>
                        <p
                          className="flex items-center gap-1.5 text-xs font-medium"
                          style={{ color: PSF.muted }}
                        >
                          <CalendarDays className="h-3.5 w-3.5" />
                          {format(selectedDay, "EEE, MMM d")}
                        </p>
                      </div>

                      {slotsLoading ? (
                        <div
                          className="flex justify-center rounded-2xl border border-dashed bg-white py-12"
                          style={{ borderColor: PSF.line }}
                        >
                          <Loader2 className="h-5 w-5 animate-spin" style={{ color: PSF.accent }} />
                        </div>
                      ) : slots.length === 0 ? (
                        <div
                          className="rounded-2xl border px-4 py-4"
                          style={{
                            borderColor: "#fed7aa",
                            background: "linear-gradient(135deg, #fff7ed, #ffedd5)",
                          }}
                        >
                          <p className="font-semibold text-orange-950">No times available on this day</p>
                          <p className="mt-1 text-xs leading-relaxed text-orange-900/75">
                            All slots may already be booked, outside working hours, or too soon to
                            book. Please pick another day.
                          </p>
                        </div>
                      ) : (
                        <div className="grid max-h-[280px] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
                          {slots.map((slot) => {
                            const selected = selectedSlot?.startIso === slot.startIso;
                            return (
                              <button
                                key={slot.startIso}
                                type="button"
                                onClick={() => setSelectedSlot(slot)}
                                className={cn(
                                  "rounded-xl border px-2 py-2.5 text-sm font-semibold transition-all duration-150",
                                  selected
                                    ? "border-transparent text-white shadow-md"
                                    : "bg-white hover:bg-orange-50"
                                )}
                                style={
                                  selected
                                    ? {
                                        backgroundColor: PSF.accent,
                                        boxShadow: `0 8px 20px ${PSF.accentSoft}`,
                                      }
                                    : {
                                        borderColor: PSF.line,
                                        color: PSF.ink,
                                      }
                                }
                              >
                                {slot.label}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div
                      className="rounded-2xl border border-dashed bg-white/80 px-4 py-8 text-center"
                      style={{ borderColor: PSF.line }}
                    >
                      <CalendarDays className="mx-auto h-8 w-8 text-orange-300" />
                      <p className="mt-2 text-sm" style={{ color: PSF.muted }}>
                        Select a date to see available times
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="animate-in fade-in slide-in-from-right-2 duration-300 space-y-5">
                  <button
                    type="button"
                    onClick={() => setSelectedSlot(null)}
                    className="inline-flex items-center gap-1.5 text-sm font-medium transition hover:opacity-80"
                    style={{ color: PSF.muted }}
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Change time
                  </button>

                  <div
                    className="rounded-2xl border px-4 py-3.5"
                    style={{
                      borderColor: "rgba(255,136,6,0.25)",
                      background: `linear-gradient(135deg, ${PSF.accentSoft}, #fff)`,
                    }}
                  >
                    <p
                      className="text-[11px] font-semibold uppercase tracking-wide"
                      style={{ color: PSF.accentDeep }}
                    >
                      Selected
                    </p>
                    <p className="mt-0.5 text-lg font-extrabold" style={{ color: PSF.ink }}>
                      {selectedDay ? format(selectedDay, "EEEE, MMMM d") : ""} ·{" "}
                      {selectedSlot?.label}
                    </p>
                    <p className="mt-0.5 text-xs" style={{ color: PSF.muted }}>
                      {schedule.durationMinutes} min · {locationLabel(schedule)}
                    </p>
                  </div>

                  <div>
                    <div className="mb-3 flex items-center gap-2">
                      <StepBadge n={3} active />
                      <h2 className="text-base font-bold" style={{ color: PSF.ink }}>
                        Your details
                      </h2>
                    </div>

                    <div
                      className="space-y-3.5 rounded-2xl border bg-white p-4 shadow-sm sm:p-5"
                      style={{ borderColor: PSF.line }}
                    >
                      <div className="space-y-1.5">
                        <Label htmlFor="bk-name" style={{ color: PSF.ink }}>
                          Name *
                        </Label>
                        <Input
                          id="bk-name"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          className="h-11 rounded-xl focus-visible:ring-orange-300"
                          style={{ borderColor: PSF.line }}
                          placeholder="Your full name"
                          autoComplete="name"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="bk-email" style={{ color: PSF.ink }}>
                          Email *
                        </Label>
                        <Input
                          id="bk-email"
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="h-11 rounded-xl focus-visible:ring-orange-300"
                          style={{ borderColor: PSF.line }}
                          placeholder="you@company.com"
                          autoComplete="email"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="bk-phone" style={{ color: PSF.ink }}>
                          Phone
                        </Label>
                        <Input
                          id="bk-phone"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          className="h-11 rounded-xl focus-visible:ring-orange-300"
                          style={{ borderColor: PSF.line }}
                          placeholder="Optional"
                          autoComplete="tel"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="bk-notes" style={{ color: PSF.ink }}>
                          Meeting agenda
                        </Label>
                        <Textarea
                          id="bk-notes"
                          rows={2}
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          className="rounded-xl focus-visible:ring-orange-300"
                          style={{ borderColor: PSF.line }}
                          placeholder="What would you like to discuss on this call?"
                        />
                      </div>

                      {error ? (
                        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                          {error}
                        </p>
                      ) : null}

                      <Button
                        type="button"
                        className="h-12 w-full rounded-xl text-base font-bold text-white shadow-lg hover:opacity-95"
                        style={{
                          background: `linear-gradient(135deg, #ff9f2e 0%, ${PSF.accent} 45%, ${PSF.accentDeep} 100%)`,
                          boxShadow: `0 12px 28px ${PSF.accentSoft}`,
                        }}
                        disabled={submitting || !name.trim() || !email.trim()}
                        onClick={() => void book()}
                      >
                        {submitting ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : null}
                        Confirm {selectedSlot?.label}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>

        <p className="mt-5 text-center text-xs text-[#ffd7a8]/50">
          <a
            href={B_CARD_PROFILE.website}
            target="_blank"
            rel="noreferrer"
            className="underline-offset-2 hover:underline"
          >
            Prep Services FBA
          </a>
          {" · "}Secure booking
        </p>
      </div>
    </div>
  );
}
