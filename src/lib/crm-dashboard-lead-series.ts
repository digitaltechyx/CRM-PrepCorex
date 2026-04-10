import { eachDayOfInterval, format, startOfDay, subDays } from "date-fns";
import type { CrmLead } from "@/contexts/crm-leads-context";
import { firestoreTimestampToDate } from "@/lib/crm-date-utils";
import type { LeadStatus, PlatformSource } from "@/lib/crm-lead-schema";
import { PIPELINE_STATUSES, PLATFORM_SOURCES, STATUS_LABELS, PLATFORM_LABELS } from "@/lib/crm-lead-schema";

export type LeadDayPoint = { date: string; label: string; leads: number };

export type LeadVelocityRange = "today" | "7d" | "14d" | "30d";

export const LEAD_VELOCITY_RANGES: { id: LeadVelocityRange; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "7d", label: "7d" },
  { id: "14d", label: "14d" },
  { id: "30d", label: "30d" },
];

const VELOCITY_DAYS: Record<LeadVelocityRange, number> = {
  today: 1,
  "7d": 7,
  "14d": 14,
  "30d": 30,
};

export function leadVelocityRangeToDays(range: LeadVelocityRange): number {
  return VELOCITY_DAYS[range];
}

/** Subtitle for the lead velocity chart card. */
export function leadVelocityRangeDescription(range: LeadVelocityRange): string {
  const lines: Record<LeadVelocityRange, string> = {
    today: "New leads captured today",
    "7d": "New leads captured per day (last 7 days)",
    "14d": "New leads captured per day (last 14 days)",
    "30d": "New leads captured per day (last 30 days)",
  };
  return lines[range];
}

/** Daily new-lead counts for the last `days` calendar days (inclusive of today). */
export function buildLeadsCreatedSeries(leads: CrmLead[], days: number, now = new Date()): LeadDayPoint[] {
  const end = startOfDay(now);
  const start = subDays(end, Math.max(1, days) - 1);
  const interval = eachDayOfInterval({ start, end });
  const dayKeys = interval.map((d) => format(d, "yyyy-MM-dd"));
  const counts = new Map<string, number>(dayKeys.map((k) => [k, 0]));

  for (const l of leads) {
    const created = firestoreTimestampToDate(l.createdAt ?? undefined);
    if (!created) continue;
    const key = format(startOfDay(created), "yyyy-MM-dd");
    if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return dayKeys.map((date) => ({
    date,
    label: format(new Date(`${date}T12:00:00`), "MMM d"),
    leads: counts.get(date) ?? 0,
  }));
}

export type StatusCountRow = { key: LeadStatus; name: string; count: number };

export function buildStatusCounts(leads: CrmLead[]): StatusCountRow[] {
  const map = new Map<LeadStatus, number>();
  for (const s of PIPELINE_STATUSES) map.set(s, 0);
  for (const l of leads) {
    const c = map.get(l.status) ?? 0;
    map.set(l.status, c + 1);
  }
  return PIPELINE_STATUSES.map((key) => ({
    key,
    name: STATUS_LABELS[key],
    count: map.get(key) ?? 0,
  }));
}

export type SourceCountRow = { key: PlatformSource; name: string; count: number };

export function buildSourceCounts(leads: CrmLead[]): SourceCountRow[] {
  const map = new Map<PlatformSource, number>();
  for (const s of PLATFORM_SOURCES) map.set(s, 0);
  for (const l of leads) {
    const c = map.get(l.platformSource) ?? 0;
    map.set(l.platformSource, c + 1);
  }
  return PLATFORM_SOURCES.map((key) => ({
    key,
    name: PLATFORM_LABELS[key],
    count: map.get(key) ?? 0,
  })).filter((r) => r.count > 0);
}

/** Active pipeline = not client and not dead. */
export function buildOutcomeSplit(leads: CrmLead[]) {
  let clients = 0;
  let dead = 0;
  let active = 0;
  for (const l of leads) {
    if (l.status === "client") clients += 1;
    else if (l.status === "dead") dead += 1;
    else active += 1;
  }
  const total = leads.length || 1;
  return {
    clients,
    dead,
    active,
    total: leads.length,
    pctClients: Math.round((100 * clients) / total),
    pctDead: Math.round((100 * dead) / total),
    pctActive: Math.round((100 * active) / total),
  };
}
