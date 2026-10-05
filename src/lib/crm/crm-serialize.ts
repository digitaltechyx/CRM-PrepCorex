import type { CrmLeadRecord, CrmTimelineRecord } from "@/lib/crm/types";

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") {
    const t = Date.parse(value);
    return Number.isFinite(t) ? new Date(t).toISOString() : value;
  }
  if (value instanceof Date) return value.toISOString();
  if (
    typeof value === "object" &&
    value &&
    "toDate" in value &&
    typeof (value as { toDate: () => Date }).toDate === "function"
  ) {
    try {
      return (value as { toDate: () => Date }).toDate().toISOString();
    } catch {
      return null;
    }
  }
  if (typeof value === "object" && value && "seconds" in value) {
    const sec = Number((value as { seconds: number }).seconds);
    if (Number.isFinite(sec)) return new Date(sec * 1000).toISOString();
  }
  return null;
}

function toDateInput(value: unknown): string | null {
  const iso = toIso(value);
  if (!iso) {
    if (typeof value === "string") {
      const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
      return match ? match[1] : null;
    }
    return null;
  }
  // Keep America/New_York calendar day for follow-ups
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(iso));
    const y = parts.find((p) => p.type === "year")?.value;
    const m = parts.find((p) => p.type === "month")?.value;
    const d = parts.find((p) => p.type === "day")?.value;
    if (y && m && d) return `${y}-${m}-${d}`;
  } catch {
    /* fall through */
  }
  return iso.slice(0, 10);
}

export function serializeLead(id: string, data: FirebaseFirestore.DocumentData): CrmLeadRecord {
  const leadName = String(data.leadName ?? data.name ?? "").trim();
  const status = String(data.status ?? data.stage ?? "new_lead").trim() || "new_lead";
  const nextFollowUpAt = toIso(data.nextFollowUpAt ?? data.followUpDate ?? data.followUpAt);

  return {
    id,
    name: leadName,
    leadName,
    phone: data.phone != null ? String(data.phone) : null,
    email: data.email != null ? String(data.email).toLowerCase() : null,
    company: data.company != null ? String(data.company) : null,
    websiteUrl: data.websiteUrl != null ? String(data.websiteUrl) : null,
    notes: data.notes != null ? String(data.notes) : null,
    stage: status,
    status,
    platformSource: data.platformSource != null ? String(data.platformSource) : null,
    country: data.country != null ? String(data.country) : null,
    businessType: data.businessType != null ? String(data.businessType) : null,
    followUpDate: toDateInput(data.nextFollowUpAt ?? data.followUpDate ?? data.followUpAt),
    nextFollowUpAt,
    nextTaskSummary:
      data.nextTaskSummary != null ? String(data.nextTaskSummary) : null,
    draftMessage: data.draftMessage != null ? String(data.draftMessage) : null,
    draftMailbox: data.draftMailbox != null ? String(data.draftMailbox) : null,
    draftUpdatedAt: toIso(data.draftUpdatedAt),
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
  };
}

export function serializeTimelineEntry(
  id: string,
  data: FirebaseFirestore.DocumentData
): CrmTimelineRecord {
  const text = String(data.text ?? data.summary ?? data.body ?? "").trim();
  return {
    id,
    type: String(data.type || "note"),
    summary: text,
    text,
    body: text || null,
    fromStatus: data.fromStatus != null ? String(data.fromStatus) : null,
    toStatus: data.toStatus != null ? String(data.toStatus) : null,
    createdByUid: data.byUid != null ? String(data.byUid) : data.createdByUid != null ? String(data.createdByUid) : null,
    createdAt: toIso(data.at ?? data.createdAt),
  };
}
