import type { LeadStatus } from "@/lib/crm-lead-schema";

/** Visual accents per pipeline stage (Tailwind classes). */
export const KANBAN_COLUMN_ACCENTS: Record<
  string,
  { bar: string; tint: string; dropHighlight: string }
> = {
  new_lead: {
    bar: "from-violet-500 via-fuchsia-500 to-pink-500",
    tint: "bg-violet-500/[0.07] dark:bg-violet-500/[0.12]",
    dropHighlight: "ring-violet-400/50 dark:ring-violet-500/40",
  },
  contacted: {
    bar: "from-sky-400 via-blue-500 to-indigo-600",
    tint: "bg-sky-500/[0.07] dark:bg-sky-500/[0.12]",
    dropHighlight: "ring-sky-400/50 dark:ring-sky-500/40",
  },
  follow_up_1: {
    bar: "from-yellow-400 via-amber-500 to-orange-600",
    tint: "bg-amber-500/[0.08] dark:bg-amber-500/[0.12]",
    dropHighlight: "ring-amber-400/50 dark:ring-amber-500/40",
  },
  follow_up_2: {
    bar: "from-orange-500 via-rose-500 to-red-600",
    tint: "bg-orange-500/[0.07] dark:bg-orange-500/[0.12]",
    dropHighlight: "ring-orange-400/50 dark:ring-orange-500/40",
  },
  qualified: {
    bar: "from-lime-500 via-emerald-500 to-teal-600",
    tint: "bg-emerald-500/[0.07] dark:bg-emerald-500/[0.12]",
    dropHighlight: "ring-emerald-400/50 dark:ring-emerald-500/40",
  },
  quote_sent: {
    bar: "from-blue-600 via-indigo-500 to-violet-600",
    tint: "bg-indigo-500/[0.07] dark:bg-indigo-500/[0.12]",
    dropHighlight: "ring-indigo-400/50 dark:ring-indigo-500/40",
  },
  negotiation: {
    bar: "from-pink-500 via-rose-600 to-red-700",
    tint: "bg-rose-500/[0.06] dark:bg-rose-500/[0.12]",
    dropHighlight: "ring-rose-400/50 dark:ring-rose-500/40",
  },
  client: {
    bar: "from-green-400 via-emerald-500 to-teal-600",
    tint: "bg-green-500/[0.08] dark:bg-green-500/[0.12]",
    dropHighlight: "ring-green-400/50 dark:ring-green-500/40",
  },
  dead: {
    bar: "from-slate-300 via-slate-500 to-slate-700",
    tint: "bg-slate-500/[0.06] dark:bg-slate-500/[0.10]",
    dropHighlight: "ring-slate-400/40 dark:ring-slate-500/35",
  },
};
