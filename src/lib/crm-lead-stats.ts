import { endOfDay, isWithinInterval, startOfDay } from "date-fns";
import type { CrmLead } from "@/contexts/crm-leads-context";
import { firestoreTimestampToDate } from "@/lib/crm-date-utils";
import type { LeadStatus } from "@/lib/crm-lead-schema";

const INTERESTED_STATUSES: LeadStatus[] = ["qualified", "quote_sent", "negotiation"];

export function computeLeadStats(leads: CrmLead[], now = new Date()) {
  const dayStart = startOfDay(now);
  const dayEnd = endOfDay(now);

  let newToday = 0;
  let dueToday = 0;
  let interested = 0;
  let clients = 0;
  let dead = 0;

  for (const l of leads) {
    const created = firestoreTimestampToDate(l.createdAt ?? undefined);
    if (created && isWithinInterval(created, { start: dayStart, end: dayEnd })) {
      newToday += 1;
    }

    const next = firestoreTimestampToDate(l.nextFollowUpAt ?? undefined);
    if (
      next &&
      l.status !== "dead" &&
      l.status !== "client" &&
      isWithinInterval(next, { start: dayStart, end: dayEnd })
    ) {
      dueToday += 1;
    }

    if (INTERESTED_STATUSES.includes(l.status)) interested += 1;
    if (l.status === "client") clients += 1;
    if (l.status === "dead") dead += 1;
  }

  const closed = clients + dead;
  const conversionRate = closed > 0 ? Math.round((100 * clients) / closed) : 0;

  return {
    total: leads.length,
    newToday,
    dueToday,
    interested,
    clients,
    dead,
    conversionRate,
  };
}
