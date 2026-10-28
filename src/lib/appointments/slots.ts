import type {
  AppointmentScheduleConfig,
  BookableSlot,
  WeekdayKey,
} from "@/lib/appointments/types";
import { WEEKDAY_KEYS } from "@/lib/appointments/types";

function parseHm(hm: string): number {
  const [h, m] = hm.split(":").map((x) => Number(x));
  return (h || 0) * 60 + (m || 0);
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/** Offset minutes east of UTC for `timeZone` at a given UTC instant. */
function timeZoneOffsetMinutes(utcMs: number, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
    hour: "2-digit",
    hourCycle: "h23",
  });
  const parts = dtf.formatToParts(new Date(utcMs));
  const tzName = parts.find((p) => p.type === "timeZoneName")?.value || "GMT";
  // "GMT-4" / "GMT+5:30" / "UTC"
  const m = tzName.match(/([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!m) return 0;
  const sign = m[1] === "-" ? -1 : 1;
  const hours = Number(m[2] || 0);
  const mins = Number(m[3] || 0);
  return sign * (hours * 60 + mins);
}

/** Convert a wall-clock time in `timeZone` to UTC Date. */
export function zonedWallTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string
): Date {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const offset = timeZoneOffsetMinutes(utcGuess, timeZone);
  // wall = utc + offset ⇒ utc = wall - offset
  let utcMs = utcGuess - offset * 60_000;
  // Correct once more if DST boundary shifted offset
  const offset2 = timeZoneOffsetMinutes(utcMs, timeZone);
  if (offset2 !== offset) {
    utcMs = utcGuess - offset2 * 60_000;
  }
  return new Date(utcMs);
}

function weekdayKeyForYmd(ymd: string, timeZone: string): WeekdayKey {
  const [y, m, d] = ymd.split("-").map(Number);
  // Noon avoids DST edge cases for weekday
  const utc = zonedWallTimeToUtc(y!, m!, d!, 12, 0, timeZone);
  const wd = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  }).format(utc);
  const map: Record<string, WeekdayKey> = {
    Sun: "sun",
    Mon: "mon",
    Tue: "tue",
    Wed: "wed",
    Thu: "thu",
    Fri: "fri",
    Sat: "sat",
  };
  return map[wd] || WEEKDAY_KEYS[utc.getUTCDay()]!;
}

function overlaps(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function computeBookableSlots(input: {
  schedule: AppointmentScheduleConfig;
  /** YYYY-MM-DD in schedule timezone */
  dateYmd: string;
  busy: Array<{ start: string; end: string }>;
  now?: Date;
}): BookableSlot[] {
  const { schedule, dateYmd, busy } = input;
  const now = input.now || new Date();
  const [y, m, d] = dateYmd.split("-").map(Number);
  if (!y || !m || !d) return [];

  const dayKey = weekdayKeyForYmd(dateYmd, schedule.timezone);
  const ranges = schedule.workingHours[dayKey] || [];
  if (ranges.length === 0) return [];

  const duration = Math.max(5, schedule.durationMinutes);
  const bufferBefore = Math.max(0, schedule.bufferBeforeMinutes);
  const bufferAfter = Math.max(0, schedule.bufferAfterMinutes);
  const minNoticeMs = Math.max(0, schedule.minNoticeHours) * 3600_000;
  const earliestBook = now.getTime() + minNoticeMs;

  const busyMs = busy.map((b) => ({
    start: new Date(b.start).getTime(),
    end: new Date(b.end).getTime(),
  }));

  const slots: BookableSlot[] = [];

  for (const range of ranges) {
    const startMin = parseHm(range.start);
    const endMin = parseHm(range.end);
    for (let t = startMin; t + duration <= endMin; t += duration) {
      const sh = Math.floor(t / 60);
      const sm = t % 60;
      const eh = Math.floor((t + duration) / 60);
      const em = (t + duration) % 60;
      const start = zonedWallTimeToUtc(y, m, d, sh, sm, schedule.timezone);
      const end = zonedWallTimeToUtc(y, m, d, eh, em, schedule.timezone);
      const startMs = start.getTime();
      const endMs = end.getTime();
      if (startMs < earliestBook) continue;

      const blockStart = startMs - bufferBefore * 60_000;
      const blockEnd = endMs + bufferAfter * 60_000;
      const conflict = busyMs.some((b) => overlaps(blockStart, blockEnd, b.start, b.end));
      if (conflict) continue;

      const label = new Intl.DateTimeFormat("en-US", {
        timeZone: schedule.timezone,
        hour: "numeric",
        minute: "2-digit",
      }).format(start);

      slots.push({
        startIso: start.toISOString(),
        endIso: end.toISOString(),
        label,
      });
    }
  }

  return slots;
}

export function formatYmdInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  return `${y}-${m}-${d}`;
}

export function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d! + days));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}
