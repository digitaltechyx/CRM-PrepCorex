import type { CrmLeadRecord, CrmTaskScope } from "@/lib/crm/types";

export function getTodayDateInputInNJ(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  if (!y || !m || !d) return now.toISOString().slice(0, 10);
  return `${y}-${m}-${d}`;
}

export function normalizeFollowUpDateInput(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    const match = /^(\d{4}-\d{2}-\d{2})/.exec(trimmed);
    if (match) return match[1];
    const parsed = Date.parse(trimmed);
    if (Number.isFinite(parsed)) return getTodayDateInputInNJ(new Date(parsed));
    return null;
  }
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return getTodayDateInputInNJ(value);
  }
  return null;
}

export function compareDateInputs(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/** Convert YYYY-MM-DD to a Date at 09:00 America/New_York (matches CRM UI follow-up style). */
export function followUpDateInputToDate(dateInput: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateInput.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  // Approx: store as local 09:00; CRM client uses Timestamp.fromDate similarly.
  const d = new Date(year, month - 1, day, 9, 0, 0, 0);
  return Number.isFinite(d.getTime()) ? d : null;
}

export function leadMatchesFollowUpScope(
  lead: Pick<CrmLeadRecord, "followUpDate" | "status">,
  scope: CrmTaskScope,
  todayInput = getTodayDateInputInNJ()
): boolean {
  if (lead.status === "dead" || lead.status === "client") return false;
  const date = lead.followUpDate;
  if (!date) return false;
  const cmp = compareDateInputs(date, todayInput);
  if (scope === "overdue") return cmp < 0;
  if (scope === "today") return cmp === 0;
  // due: today + overdue (missed follow-ups stay visible)
  return cmp <= 0;
}

export function sortLeadsByFollowUpDate(
  leads: CrmLeadRecord[],
  direction: "asc" | "desc" = "asc"
): CrmLeadRecord[] {
  return [...leads].sort((a, b) => {
    const da = a.followUpDate || "";
    const db = b.followUpDate || "";
    if (da === db) return 0;
    const cmp = da < db ? -1 : 1;
    return direction === "asc" ? cmp : -cmp;
  });
}
