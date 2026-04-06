import type { LeadStatus, PlatformSource } from "@/lib/crm-lead-schema";

/** Platform pills (Kanban cards + list view). */
export const PLATFORM_PILL_CLASS: Partial<Record<PlatformSource, string>> = {
  whatsapp: "bg-emerald-500/12 text-emerald-900 ring-emerald-500/25 dark:text-emerald-300",
  linkedin: "bg-sky-500/10 text-sky-800 ring-sky-500/20 dark:text-sky-200",
  facebook: "bg-blue-600/10 text-blue-800 ring-blue-600/20 dark:text-blue-200",
  amazon: "bg-amber-500/12 text-amber-900 ring-amber-500/25 dark:text-amber-200",
  email: "bg-violet-500/10 text-violet-900 ring-violet-500/20 dark:text-violet-200",
  website: "bg-teal-500/10 text-teal-900 ring-teal-500/20 dark:text-teal-200",
};

export function platformPillClass(source: PlatformSource): string {
  return PLATFORM_PILL_CLASS[source] ?? "bg-muted/80 text-muted-foreground ring-border";
}

/** Status pills aligned with pipeline column colors (list + compact UI). */
export const LEAD_STATUS_PILL_CLASS: Record<LeadStatus, string> = {
  new_lead: "bg-violet-500/12 text-violet-900 ring-violet-500/25 dark:text-violet-200",
  contacted: "bg-sky-500/12 text-sky-900 ring-sky-500/25 dark:text-sky-200",
  follow_up_1: "bg-amber-500/14 text-amber-950 ring-amber-500/30 dark:text-amber-200",
  follow_up_2: "bg-orange-500/12 text-orange-950 ring-orange-500/25 dark:text-orange-200",
  qualified: "bg-emerald-500/12 text-emerald-900 ring-emerald-500/25 dark:text-emerald-200",
  quote_sent: "bg-indigo-500/12 text-indigo-900 ring-indigo-500/25 dark:text-indigo-200",
  negotiation: "bg-rose-500/12 text-rose-900 ring-rose-500/25 dark:text-rose-200",
  client: "bg-green-500/14 text-green-950 ring-green-500/30 dark:text-green-200",
  dead: "bg-slate-500/12 text-slate-800 ring-slate-500/25 dark:text-slate-300",
};
