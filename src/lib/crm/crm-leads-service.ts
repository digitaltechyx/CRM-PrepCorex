import { Timestamp } from "firebase-admin/firestore";
import type { QueryDocumentSnapshot } from "firebase-admin/firestore";
import { getAdminDb, getAdminFieldValue } from "@/lib/firebase-admin";
import type { CrmAutomationActor } from "@/lib/crm/crm-automation-auth";
import {
  compareDateInputs,
  followUpDateInputToDate,
  leadMatchesFollowUpScope,
  normalizeFollowUpDateInput,
  sortLeadsByFollowUpDate,
} from "@/lib/crm/crm-follow-up";
import { serializeLead, serializeTimelineEntry } from "@/lib/crm/crm-serialize";
import type {
  CrmLeadRecord,
  CrmLeadSearchParams,
  CrmTaskScope,
  CrmTimelineRecord,
  CrmTimelineType,
} from "@/lib/crm/types";
import { CRM_LEADS_COLLECTION, CRM_TIMELINE_SUBCOLLECTION } from "@/lib/crm/types";
import { defaultFollowUpDaysForStatus, addDays } from "@/lib/crm-lead-schema";

const MAX_LIST = 500;

function cleanText(value: unknown, max: number): string {
  return String(value ?? "")
    .trim()
    .slice(0, max);
}

function db() {
  return getAdminDb();
}

function fv() {
  return getAdminFieldValue();
}

function leadRef(id: string) {
  return db().collection(CRM_LEADS_COLLECTION).doc(id);
}

function timelineCol(leadId: string) {
  return leadRef(leadId).collection(CRM_TIMELINE_SUBCOLLECTION);
}

async function appendTimeline(
  leadId: string,
  entry: {
    type: CrmTimelineType | string;
    text: string;
    byUid: string;
    fromStatus?: string;
    toStatus?: string;
  }
) {
  await timelineCol(leadId).add({
    at: fv().serverTimestamp(),
    type: entry.type,
    text: entry.text,
    byUid: entry.byUid,
    ...(entry.fromStatus ? { fromStatus: entry.fromStatus } : {}),
    ...(entry.toStatus ? { toStatus: entry.toStatus } : {}),
  });
}

async function fetchLeadDocs() {
  const col = db().collection(CRM_LEADS_COLLECTION);
  try {
    return await col.orderBy("updatedAt", "desc").limit(MAX_LIST).get();
  } catch {
    return await col.limit(MAX_LIST).get();
  }
}

export async function listCrmLeads(params: CrmLeadSearchParams = {}): Promise<CrmLeadRecord[]> {
  const snap = await fetchLeadDocs();
  let leads: CrmLeadRecord[] = snap.docs.map((doc: QueryDocumentSnapshot) =>
    serializeLead(doc.id, doc.data())
  );

  const q = cleanText(params.q, 120).toLowerCase();
  if (q) {
    leads = leads.filter((lead: CrmLeadRecord) => {
      const hay = [lead.leadName, lead.email, lead.phone, lead.company, lead.notes, lead.id]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }

  const stage = cleanText(params.stage || params.status, 40).toLowerCase();
  if (stage) {
    leads = leads.filter(
      (lead: CrmLeadRecord) => String(lead.status || "").toLowerCase() === stage
    );
  }

  if (params.followUpBefore) {
    const before = normalizeFollowUpDateInput(params.followUpBefore);
    if (before) {
      leads = leads.filter(
        (lead: CrmLeadRecord) =>
          lead.followUpDate && compareDateInputs(lead.followUpDate, before) <= 0
      );
    }
  }

  if (params.followUpAfter) {
    const after = normalizeFollowUpDateInput(params.followUpAfter);
    if (after) {
      leads = leads.filter(
        (lead: CrmLeadRecord) =>
          lead.followUpDate && compareDateInputs(lead.followUpDate, after) >= 0
      );
    }
  }

  const limit = Math.min(Math.max(params.limit ?? 100, 1), 200);
  return leads.slice(0, limit);
}

export async function getCrmLead(id: string): Promise<CrmLeadRecord | null> {
  const snap = await leadRef(id).get();
  if (!snap.exists) return null;
  return serializeLead(snap.id, snap.data() || {});
}

function resolveName(input: Partial<CrmLeadRecord> & Record<string, unknown>): string {
  return cleanText(input.leadName ?? input.name, 120);
}

function resolveStatus(input: Partial<CrmLeadRecord> & Record<string, unknown>): string {
  return cleanText(input.status ?? input.stage ?? "new_lead", 40) || "new_lead";
}

export async function createCrmLead(
  input: Partial<CrmLeadRecord> & Record<string, unknown>,
  actor: CrmAutomationActor
): Promise<CrmLeadRecord> {
  const leadName = resolveName(input);
  if (!leadName) throw new Error("leadName (or name) is required.");

  const phone = cleanText(input.phone, 40);
  const email = cleanText(input.email, 120).toLowerCase();
  if (!phone && !email) throw new Error("phone or email is required.");

  const status = resolveStatus(input);
  const followUpDate = normalizeFollowUpDateInput(input.followUpDate);
  let nextFollowUpAt: FirebaseFirestore.Timestamp | null = null;
  if (followUpDate) {
    const d = followUpDateInputToDate(followUpDate);
    nextFollowUpAt = d ? Timestamp.fromDate(d) : null;
  } else {
    const days = defaultFollowUpDaysForStatus(status);
    nextFollowUpAt = days == null ? null : Timestamp.fromDate(addDays(new Date(), days));
  }

  const ref = await db()
    .collection(CRM_LEADS_COLLECTION)
    .add({
      leadName,
      company: cleanText(input.company, 120),
      email,
      phone,
      websiteUrl: cleanText(input.websiteUrl, 300),
      platformSource: cleanText(input.platformSource || "other", 40) || "other",
      country: cleanText(input.country, 80),
      businessType: cleanText(input.businessType, 80),
      status,
      firstContactAt: fv().serverTimestamp(),
      lastContactAt: fv().serverTimestamp(),
      nextFollowUpAt,
      notes: cleanText(input.notes, 2000),
      nextTaskSummary: cleanText(input.nextTaskSummary, 500) || null,
      createdByUid: actor.uid,
      createdAt: fv().serverTimestamp(),
      updatedAt: fv().serverTimestamp(),
    });

  await appendTimeline(ref.id, {
    type: "system",
    text: `Lead created via ${actor.via} (${leadName}) · status: ${status}`,
    byUid: actor.uid,
  });

  const created = await getCrmLead(ref.id);
  if (!created) throw new Error("Lead created but could not be loaded.");
  return created;
}

export async function updateCrmLead(
  id: string,
  patch: Partial<CrmLeadRecord> & Record<string, unknown>,
  actor: CrmAutomationActor
): Promise<CrmLeadRecord> {
  const existingSnap = await leadRef(id).get();
  if (!existingSnap.exists) throw new Error("Lead not found.");
  const existing = serializeLead(existingSnap.id, existingSnap.data() || {});

  const updates: Record<string, unknown> = {
    updatedAt: fv().serverTimestamp(),
    lastContactAt: fv().serverTimestamp(),
  };

  if (patch.leadName != null || patch.name != null) {
    updates.leadName = resolveName(patch);
  }
  if (patch.company !== undefined) updates.company = cleanText(patch.company, 120);
  if (patch.email !== undefined) updates.email = cleanText(patch.email, 120).toLowerCase();
  if (patch.phone !== undefined) updates.phone = cleanText(patch.phone, 40);
  if (patch.websiteUrl !== undefined) updates.websiteUrl = cleanText(patch.websiteUrl, 300);
  if (patch.notes !== undefined) updates.notes = cleanText(patch.notes, 2000);
  if (patch.platformSource !== undefined)
    updates.platformSource = cleanText(patch.platformSource, 40) || "other";
  if (patch.country !== undefined) updates.country = cleanText(patch.country, 80);
  if (patch.businessType !== undefined)
    updates.businessType = cleanText(patch.businessType, 80);
  if (patch.nextTaskSummary !== undefined)
    updates.nextTaskSummary = cleanText(patch.nextTaskSummary, 500) || null;

  const nextStatus =
    patch.status != null || patch.stage != null ? resolveStatus(patch) : null;
  if (nextStatus) updates.status = nextStatus;

  if (patch.followUpDate !== undefined) {
    const dateInput = normalizeFollowUpDateInput(patch.followUpDate);
    if (!dateInput) {
      updates.nextFollowUpAt = null;
    } else {
      const d = followUpDateInputToDate(dateInput);
      updates.nextFollowUpAt = d ? Timestamp.fromDate(d) : null;
    }
  } else if (nextStatus && nextStatus !== existing.status) {
    const days = defaultFollowUpDaysForStatus(nextStatus);
    updates.nextFollowUpAt =
      days == null ? null : Timestamp.fromDate(addDays(new Date(), days));
  }

  await leadRef(id).update(updates);

  if (nextStatus && nextStatus !== existing.status) {
    await appendTimeline(id, {
      type: "status_change",
      text: `Status: ${existing.status} → ${nextStatus}`,
      byUid: actor.uid,
      fromStatus: existing.status,
      toStatus: nextStatus,
    });
  }

  if (patch.followUpDate !== undefined) {
    const nextDate = normalizeFollowUpDateInput(patch.followUpDate);
    if (nextDate !== existing.followUpDate) {
      await appendTimeline(id, {
        type: "task",
        text: nextDate ? `Follow-up set to ${nextDate}` : "Follow-up cleared",
        byUid: actor.uid,
      });
    }
  }

  if (patch.notes !== undefined && patch.notes && patch.notes !== existing.notes) {
    await appendTimeline(id, {
      type: "note",
      text: cleanText(patch.notes, 2000),
      byUid: actor.uid,
    });
  }

  const updated = await getCrmLead(id);
  if (!updated) throw new Error("Lead not found after update.");
  return updated;
}

export async function listCrmLeadActivities(
  leadId: string,
  limit = 50
): Promise<CrmTimelineRecord[]> {
  const lead = await getCrmLead(leadId);
  if (!lead) throw new Error("Lead not found.");

  try {
    const snap = await timelineCol(leadId)
      .orderBy("at", "desc")
      .limit(Math.min(Math.max(limit, 1), 200))
      .get();
    return snap.docs.map((doc: QueryDocumentSnapshot) =>
      serializeTimelineEntry(doc.id, doc.data() || {})
    );
  } catch {
    const snap = await timelineCol(leadId).limit(Math.min(Math.max(limit, 1), 200)).get();
    return snap.docs.map((doc: QueryDocumentSnapshot) =>
      serializeTimelineEntry(doc.id, doc.data() || {})
    );
  }
}

export async function addCrmLeadActivity(
  leadId: string,
  input: {
    type?: string;
    summary?: string;
    text?: string;
    body?: string | null;
  },
  actor: CrmAutomationActor
): Promise<CrmTimelineRecord> {
  const lead = await getCrmLead(leadId);
  if (!lead) throw new Error("Lead not found.");

  const text = cleanText(input.text ?? input.summary ?? input.body, 4000);
  if (!text) throw new Error("summary (or text) is required.");

  const type = cleanText(input.type || "note", 40) || "note";
  const ref = await timelineCol(leadId).add({
    at: fv().serverTimestamp(),
    type,
    text,
    byUid: actor.uid,
  });

  await leadRef(leadId).update({
    updatedAt: fv().serverTimestamp(),
    lastContactAt: fv().serverTimestamp(),
  });

  const snap = await ref.get();
  return serializeTimelineEntry(snap.id, snap.data() || {});
}

export async function getCrmLeadDraft(leadId: string) {
  const lead = await getCrmLead(leadId);
  if (!lead) return null;
  return {
    leadId,
    draftMessage: lead.draftMessage ?? "",
    draftMailbox: lead.draftMailbox ?? null,
    draftUpdatedAt: lead.draftUpdatedAt ?? null,
  };
}

export async function setCrmLeadDraft(
  leadId: string,
  input: { draftMessage?: string; draftMailbox?: string | null },
  actor: CrmAutomationActor
) {
  const lead = await getCrmLead(leadId);
  if (!lead) throw new Error("Lead not found.");

  const draftMessage =
    input.draftMessage != null
      ? String(input.draftMessage).slice(0, 20000)
      : lead.draftMessage ?? "";
  const draftMailbox =
    input.draftMailbox !== undefined
      ? cleanText(input.draftMailbox, 80) || null
      : lead.draftMailbox ?? null;

  await leadRef(leadId).update({
    draftMessage,
    draftMailbox,
    draftUpdatedAt: fv().serverTimestamp(),
    updatedAt: fv().serverTimestamp(),
  });

  await appendTimeline(leadId, {
    type: "system",
    text: draftMailbox ? `Draft saved · mailbox ${draftMailbox}` : "Draft saved",
    byUid: actor.uid,
  });

  return getCrmLeadDraft(leadId);
}

export async function listCrmTasksByScope(scope: CrmTaskScope): Promise<CrmLeadRecord[]> {
  const snap = await fetchLeadDocs();
  const leads = snap.docs
    .map((doc: QueryDocumentSnapshot) => serializeLead(doc.id, doc.data() || {}))
    .filter((lead: CrmLeadRecord) => leadMatchesFollowUpScope(lead, scope));
  return sortLeadsByFollowUpDate(leads, "asc");
}
