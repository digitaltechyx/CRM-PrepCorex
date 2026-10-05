export const CRM_LEADS_COLLECTION = "crmLeads";
export const CRM_TIMELINE_SUBCOLLECTION = "timeline";

/** ChatGPT-friendly lead DTO (aliases map to CRM Firestore fields). */
export type CrmLeadRecord = {
  id: string;
  /** Alias of Firestore `leadName`. */
  name: string;
  leadName: string;
  phone?: string | null;
  email?: string | null;
  company?: string | null;
  websiteUrl?: string | null;
  notes?: string | null;
  /** Alias of Firestore `status`. */
  stage: string;
  status: string;
  platformSource?: string | null;
  country?: string | null;
  businessType?: string | null;
  /** Calendar follow-up date YYYY-MM-DD (from `nextFollowUpAt`). */
  followUpDate?: string | null;
  nextFollowUpAt?: string | null;
  nextTaskSummary?: string | null;
  draftMessage?: string | null;
  draftMailbox?: string | null;
  draftUpdatedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type CrmTimelineType =
  | "note"
  | "status_change"
  | "system"
  | "call"
  | "email"
  | "whatsapp"
  | "task";

export type CrmTimelineRecord = {
  id: string;
  type: CrmTimelineType | string;
  /** Alias of Firestore `text`. */
  summary: string;
  text: string;
  body?: string | null;
  fromStatus?: string | null;
  toStatus?: string | null;
  createdByUid?: string | null;
  createdAt?: string | null;
};

export type CrmLeadSearchParams = {
  q?: string;
  stage?: string;
  status?: string;
  followUpBefore?: string;
  followUpAfter?: string;
  limit?: number;
};

export type CrmTaskScope = "overdue" | "due" | "today";
