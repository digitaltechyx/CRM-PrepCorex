import {
  LEAD_STATUSES,
  STATUS_LABELS,
  type LeadStatus,
  defaultFollowUpDaysForStatus as defaultFollowUpDaysForSystemStatus,
} from "@/lib/crm-lead-schema";

export const CRM_PIPELINE_SETTINGS_DOC = "lead_pipeline";
export const CRM_SETTINGS_COLLECTION = "crm_settings";

export type PipelineStatusKind = "open" | "won" | "lost";

export type PipelineAccentKey =
  | "violet"
  | "sky"
  | "amber"
  | "orange"
  | "emerald"
  | "indigo"
  | "rose"
  | "green"
  | "slate"
  | "cyan"
  | "fuchsia"
  | "lime";

export type PipelineStatusDef = {
  id: string;
  label: string;
  order: number;
  kind: PipelineStatusKind;
  /** Hide from Kanban / selects (existing leads keep the status). */
  hidden?: boolean;
  isSystem?: boolean;
  accentKey?: PipelineAccentKey;
  followUpDays?: number | null;
};

export type LeadPipelineConfig = {
  statuses: PipelineStatusDef[];
  updatedAt?: unknown;
  updatedByUid?: string;
};

export const PIPELINE_ACCENTS: Record<
  PipelineAccentKey,
  { bar: string; tint: string; dropHighlight: string; pill: string }
> = {
  violet: {
    bar: "from-violet-500 via-fuchsia-500 to-pink-500",
    tint: "bg-violet-500/[0.07] dark:bg-violet-500/[0.12]",
    dropHighlight: "ring-violet-400/50 dark:ring-violet-500/40",
    pill: "bg-violet-500/12 text-violet-900 ring-violet-500/25 dark:text-violet-200",
  },
  sky: {
    bar: "from-sky-400 via-blue-500 to-indigo-600",
    tint: "bg-sky-500/[0.07] dark:bg-sky-500/[0.12]",
    dropHighlight: "ring-sky-400/50 dark:ring-sky-500/40",
    pill: "bg-sky-500/12 text-sky-900 ring-sky-500/25 dark:text-sky-200",
  },
  amber: {
    bar: "from-yellow-400 via-amber-500 to-orange-600",
    tint: "bg-amber-500/[0.08] dark:bg-amber-500/[0.12]",
    dropHighlight: "ring-amber-400/50 dark:ring-amber-500/40",
    pill: "bg-amber-500/14 text-amber-950 ring-amber-500/30 dark:text-amber-200",
  },
  orange: {
    bar: "from-orange-500 via-rose-500 to-red-600",
    tint: "bg-orange-500/[0.07] dark:bg-orange-500/[0.12]",
    dropHighlight: "ring-orange-400/50 dark:ring-orange-500/40",
    pill: "bg-orange-500/12 text-orange-950 ring-orange-500/25 dark:text-orange-200",
  },
  emerald: {
    bar: "from-lime-500 via-emerald-500 to-teal-600",
    tint: "bg-emerald-500/[0.07] dark:bg-emerald-500/[0.12]",
    dropHighlight: "ring-emerald-400/50 dark:ring-emerald-500/40",
    pill: "bg-emerald-500/12 text-emerald-900 ring-emerald-500/25 dark:text-emerald-200",
  },
  indigo: {
    bar: "from-blue-600 via-indigo-500 to-violet-600",
    tint: "bg-indigo-500/[0.07] dark:bg-indigo-500/[0.12]",
    dropHighlight: "ring-indigo-400/50 dark:ring-indigo-500/40",
    pill: "bg-indigo-500/12 text-indigo-900 ring-indigo-500/25 dark:text-indigo-200",
  },
  rose: {
    bar: "from-pink-500 via-rose-600 to-red-700",
    tint: "bg-rose-500/[0.06] dark:bg-rose-500/[0.12]",
    dropHighlight: "ring-rose-400/50 dark:ring-rose-500/40",
    pill: "bg-rose-500/12 text-rose-900 ring-rose-500/25 dark:text-rose-200",
  },
  green: {
    bar: "from-green-400 via-emerald-500 to-teal-600",
    tint: "bg-green-500/[0.08] dark:bg-green-500/[0.12]",
    dropHighlight: "ring-green-400/50 dark:ring-green-500/40",
    pill: "bg-green-500/14 text-green-950 ring-green-500/30 dark:text-green-200",
  },
  slate: {
    bar: "from-slate-300 via-slate-500 to-slate-700",
    tint: "bg-slate-500/[0.06] dark:bg-slate-500/[0.10]",
    dropHighlight: "ring-slate-400/40 dark:ring-slate-500/35",
    pill: "bg-slate-500/12 text-slate-800 ring-slate-500/25 dark:text-slate-300",
  },
  cyan: {
    bar: "from-cyan-400 via-teal-500 to-emerald-600",
    tint: "bg-cyan-500/[0.07] dark:bg-cyan-500/[0.12]",
    dropHighlight: "ring-cyan-400/50 dark:ring-cyan-500/40",
    pill: "bg-cyan-500/12 text-cyan-900 ring-cyan-500/25 dark:text-cyan-200",
  },
  fuchsia: {
    bar: "from-fuchsia-500 via-pink-500 to-rose-600",
    tint: "bg-fuchsia-500/[0.07] dark:bg-fuchsia-500/[0.12]",
    dropHighlight: "ring-fuchsia-400/50 dark:ring-fuchsia-500/40",
    pill: "bg-fuchsia-500/12 text-fuchsia-900 ring-fuchsia-500/25 dark:text-fuchsia-200",
  },
  lime: {
    bar: "from-lime-400 via-green-500 to-emerald-600",
    tint: "bg-lime-500/[0.08] dark:bg-lime-500/[0.12]",
    dropHighlight: "ring-lime-400/50 dark:ring-lime-500/40",
    pill: "bg-lime-500/12 text-lime-950 ring-lime-500/25 dark:text-lime-200",
  },
};

const SYSTEM_ACCENT: Record<string, PipelineAccentKey> = {
  new_lead: "violet",
  contacted: "sky",
  follow_up_1: "amber",
  follow_up_2: "orange",
  qualified: "emerald",
  quote_sent: "indigo",
  negotiation: "rose",
  client: "green",
  dead: "slate",
};

const SYSTEM_KIND: Record<string, PipelineStatusKind> = {
  client: "won",
  dead: "lost",
};

const CUSTOM_ACCENT_ROTATION: PipelineAccentKey[] = [
  "cyan",
  "fuchsia",
  "lime",
  "amber",
  "indigo",
  "rose",
  "sky",
  "violet",
];

export function buildDefaultPipelineStatuses(): PipelineStatusDef[] {
  return LEAD_STATUSES.map((id, order) => ({
    id,
    label: STATUS_LABELS[id],
    order,
    kind: SYSTEM_KIND[id] ?? "open",
    isSystem: true,
    hidden: false,
    accentKey: SYSTEM_ACCENT[id] ?? "slate",
    followUpDays: defaultFollowUpDaysForSystemStatus(id),
  }));
}

export function slugifyStatusId(label: string): string {
  const base = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
  return base || `custom_${Date.now().toString(36)}`;
}

export function ensureUniqueStatusId(desired: string, existingIds: Set<string>): string {
  let id = desired;
  let n = 2;
  while (existingIds.has(id)) {
    id = `${desired}_${n}`;
    n += 1;
  }
  return id;
}

/** Merge Firestore config with defaults so system stages always exist. */
export function mergePipelineConfig(raw: unknown): PipelineStatusDef[] {
  const defaults = buildDefaultPipelineStatuses();
  const defaultById = new Map(defaults.map((s) => [s.id, s]));
  const incoming = Array.isArray((raw as LeadPipelineConfig | null)?.statuses)
    ? (raw as LeadPipelineConfig).statuses
    : [];

  const byId = new Map<string, PipelineStatusDef>();

  for (const d of defaults) {
    byId.set(d.id, { ...d });
  }

  for (const row of incoming) {
    if (!row || typeof row !== "object") continue;
    const id = String((row as PipelineStatusDef).id || "").trim();
    if (!id) continue;
    const base = defaultById.get(id);
    const label = String((row as PipelineStatusDef).label || base?.label || id).trim() || id;
    const order =
      typeof (row as PipelineStatusDef).order === "number"
        ? (row as PipelineStatusDef).order
        : base?.order ?? byId.size;
    const kind =
      (row as PipelineStatusDef).kind === "won" || (row as PipelineStatusDef).kind === "lost"
        ? (row as PipelineStatusDef).kind
        : base?.kind ?? "open";
    const accentKey =
      ((row as PipelineStatusDef).accentKey as PipelineAccentKey | undefined) ||
      base?.accentKey ||
      CUSTOM_ACCENT_ROTATION[byId.size % CUSTOM_ACCENT_ROTATION.length];

    byId.set(id, {
      id,
      label,
      order,
      kind: id === "client" ? "won" : id === "dead" ? "lost" : kind,
      isSystem: Boolean(base?.isSystem || (row as PipelineStatusDef).isSystem),
      hidden: Boolean((row as PipelineStatusDef).hidden),
      accentKey,
      followUpDays:
        (row as PipelineStatusDef).followUpDays !== undefined
          ? (row as PipelineStatusDef).followUpDays
          : base?.followUpDays ?? 2,
    });
  }

  return Array.from(byId.values()).sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
}

export function visiblePipelineStatuses(statuses: PipelineStatusDef[]): PipelineStatusDef[] {
  return statuses.filter((s) => !s.hidden);
}

export function getPipelineStatusLabel(statuses: PipelineStatusDef[], id: string): string {
  return statuses.find((s) => s.id === id)?.label || STATUS_LABELS[id as keyof typeof STATUS_LABELS] || id;
}

export function getPipelineAccent(statuses: PipelineStatusDef[], id: string) {
  const key =
    statuses.find((s) => s.id === id)?.accentKey ||
    SYSTEM_ACCENT[id] ||
    CUSTOM_ACCENT_ROTATION[Math.abs(hashString(id)) % CUSTOM_ACCENT_ROTATION.length];
  return PIPELINE_ACCENTS[key];
}

export function followUpDaysForPipelineStatus(
  statuses: PipelineStatusDef[],
  id: LeadStatus
): number | null {
  const def = statuses.find((s) => s.id === id);
  if (def) {
    if (def.kind === "won" || def.kind === "lost") return null;
    if (def.followUpDays === null) return null;
    if (typeof def.followUpDays === "number") return def.followUpDays;
  }
  if ((LEAD_STATUSES as readonly string[]).includes(id)) {
    return defaultFollowUpDaysForSystemStatus(id as (typeof LEAD_STATUSES)[number]);
  }
  return 2;
}

export function nextCustomAccentKey(statuses: PipelineStatusDef[]): PipelineAccentKey {
  const used = new Set(statuses.map((s) => s.accentKey).filter(Boolean));
  for (const key of CUSTOM_ACCENT_ROTATION) {
    if (!used.has(key)) return key;
  }
  return CUSTOM_ACCENT_ROTATION[statuses.length % CUSTOM_ACCENT_ROTATION.length];
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}
