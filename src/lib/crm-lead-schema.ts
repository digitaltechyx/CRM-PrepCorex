/** PrepCorex CRM — Lead Management (Phase 1) */

export const LEAD_STATUSES = [
  "new_lead",
  "contacted",
  "follow_up_1",
  "follow_up_2",
  "qualified",
  "quote_sent",
  "negotiation",
  "client",
  "dead",
] as const;

/** System default status ids. Custom pipeline statuses are free-form strings. */
export type SystemLeadStatus = (typeof LEAD_STATUSES)[number];
export type LeadStatus = string;

export const STATUS_LABELS: Record<SystemLeadStatus, string> = {
  new_lead: "New lead",
  contacted: "Contacted",
  follow_up_1: "Follow-up 1",
  follow_up_2: "Follow-up 2",
  qualified: "Interested / Qualified",
  quote_sent: "Quote sent",
  negotiation: "Negotiation",
  client: "Client",
  dead: "Not interested / No reply",
};

/** Kanban column order (left → right) for defaults before custom pipeline config loads. */
export const PIPELINE_STATUSES: LeadStatus[] = [...LEAD_STATUSES];

export const PLATFORM_SOURCES = [
  "linkedin",
  "amazon",
  "facebook",
  "email",
  "whatsapp",
  "website",
  "other",
] as const;

export type PlatformSource = (typeof PLATFORM_SOURCES)[number];

export const PLATFORM_LABELS: Record<PlatformSource, string> = {
  linkedin: "LinkedIn",
  amazon: "Amazon Seller",
  facebook: "Facebook",
  email: "Email outreach",
  whatsapp: "WhatsApp",
  website: "Website",
  other: "Other",
};

export const BUSINESS_TYPES = [
  "amazon_seller",
  "agency",
  "wholesaler",
  "private_label",
  "online_arbitrage",
  "blind_dropshipping",
  "other",
] as const;

export type BusinessType = (typeof BUSINESS_TYPES)[number];

export const BUSINESS_TYPE_LABELS: Record<BusinessType, string> = {
  amazon_seller: "Amazon Seller",
  agency: "Agency",
  wholesaler: "Wholesaler",
  private_label: "Private Label (PL)",
  online_arbitrage: "Online Arbitrage (OA)",
  blind_dropshipping: "Blind Dropshipping",
  other: "Other",
};

/** Days until next follow-up when entering this status (from spec). Custom statuses default to 2. */
export function defaultFollowUpDaysForStatus(status: LeadStatus): number | null {
  if (status === "dead" || status === "client") return null;
  switch (status) {
    case "new_lead":
      return 2;
    case "contacted":
      return 3;
    case "qualified":
    case "quote_sent":
    case "negotiation":
      return 1;
    case "follow_up_1":
    case "follow_up_2":
      return 2;
    default:
      return 2;
  }
}

export function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  x.setHours(9, 0, 0, 0);
  return x;
}

export type TimelineEntryType = "note" | "status_change" | "system";

export interface CrmLeadInput {
  leadName: string;
  company?: string;
  email?: string;
  phone?: string;
  /** Website, store, or social profile URL */
  websiteUrl?: string;
  platformSource: PlatformSource;
  country?: string;
  businessType?: BusinessType | "";
  notes?: string;
  /** Defaults to new_lead when omitted (e.g. Quick add). */
  status?: LeadStatus;
  /** Address book contact this lead was created from. */
  contactId?: string;
}
