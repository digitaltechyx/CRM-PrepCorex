import { adminDb } from "@/lib/firebase-admin";
import { CRM_LEADS_COLLECTION } from "@/lib/crm/types";
import { createLexiMessage } from "@/lib/lexi/messages";
import type { LexiMessageType } from "@/lib/lexi/types";

export type LexiPendingAction = {
  type: string;
  summary: string;
  payload: Record<string, unknown>;
};

const ACTION_PREFIX = "LEXI_ACTION:";

export function extractLexiAction(reply: string): {
  text: string;
  pendingAction: LexiPendingAction | null;
} {
  const lines = String(reply || "").split("\n");
  let pendingAction: LexiPendingAction | null = null;
  const kept: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith(ACTION_PREFIX)) {
      try {
        const json = trimmed.slice(ACTION_PREFIX.length);
        const parsed = JSON.parse(json) as LexiPendingAction;
        if (parsed?.type && parsed?.summary) {
          pendingAction = {
            type: String(parsed.type),
            summary: String(parsed.summary).slice(0, 500),
            payload:
              parsed.payload && typeof parsed.payload === "object"
                ? (parsed.payload as Record<string, unknown>)
                : {},
          };
        }
      } catch {
        kept.push(line);
      }
      continue;
    }
    kept.push(line);
  }

  return {
    text: kept.join("\n").trim(),
    pendingAction,
  };
}

export async function executeLexiAction(
  action: LexiPendingAction
): Promise<{ message: string }> {
  const type = String(action.type || "");
  const payload = action.payload || {};

  if (type === "update_lead_status") {
    const leadId = String(payload.leadId || "").trim();
    const status = String(payload.status || "").trim();
    if (!leadId || !status) throw new Error("leadId and status are required.");
    const ref = adminDb().collection(CRM_LEADS_COLLECTION).doc(leadId);
    const snap = await ref.get();
    if (!snap.exists) throw new Error(`Lead ${leadId} not found.`);
    const prev = String(snap.data()?.status || "");
    await ref.set(
      {
        status,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
    const name = String(payload.leadName || snap.data()?.leadName || leadId);
    return {
      message: `Updated lead "${name}" status: ${prev || "?"} → ${status}.`,
    };
  }

  if (type === "set_lead_follow_up") {
    const leadId = String(payload.leadId || "").trim();
    const nextFollowUpAt = String(payload.nextFollowUpAt || "").trim();
    if (!leadId || !nextFollowUpAt) {
      throw new Error("leadId and nextFollowUpAt (YYYY-MM-DD) are required.");
    }
    const ref = adminDb().collection(CRM_LEADS_COLLECTION).doc(leadId);
    const snap = await ref.get();
    if (!snap.exists) throw new Error(`Lead ${leadId} not found.`);
    const patch: Record<string, unknown> = {
      nextFollowUpAt,
      updatedAt: new Date().toISOString(),
    };
    if (payload.nextTaskSummary) {
      patch.nextTaskSummary = String(payload.nextTaskSummary).slice(0, 500);
    }
    await ref.set(patch, { merge: true });
    const name = String(payload.leadName || snap.data()?.leadName || leadId);
    return {
      message: `Set follow-up for "${name}" to ${nextFollowUpAt}.`,
    };
  }

  if (type === "create_contact_note" || type === "post_lexi_notice") {
    const title = String(payload.title || "Lexi tip").slice(0, 200);
    const body = String(payload.body || action.summary || "").slice(0, 4000);
    const href = String(payload.href || "/dashboard");
    const noticeType = (String(payload.messageType || "general") ||
      "general") as LexiMessageType;
    await createLexiMessage({
      type: noticeType,
      title,
      body,
      href,
      meta: { source: "lexi_action" },
    });
    return { message: `Posted Lexi notice: ${title}` };
  }

  if (type === "update_quote_status") {
    const quoteId = String(payload.quoteId || "").trim();
    const status = String(payload.status || "").trim();
    if (!quoteId || !status) throw new Error("quoteId and status are required.");
    const ref = adminDb().collection("quotes").doc(quoteId);
    const snap = await ref.get();
    if (!snap.exists) throw new Error(`Quote ${quoteId} not found.`);
    const prev = String(snap.data()?.status || "");
    await ref.set(
      { status, updatedAt: new Date().toISOString() },
      { merge: true }
    );
    const label = String(payload.quoteNumber || snap.data()?.quoteNumber || quoteId);
    return {
      message: `Updated quote "${label}" status: ${prev || "?"} → ${status}.`,
    };
  }

  if (type === "update_invoice_status") {
    const invoiceId = String(payload.invoiceId || "").trim();
    const status = String(payload.status || "").trim();
    if (!invoiceId || !status) throw new Error("invoiceId and status are required.");
    const ref = adminDb().collection("external_invoices").doc(invoiceId);
    const snap = await ref.get();
    if (!snap.exists) throw new Error(`Invoice ${invoiceId} not found.`);
    const prev = String(snap.data()?.status || "");
    await ref.set(
      { status, updatedAt: new Date().toISOString() },
      { merge: true }
    );
    const label = String(
      payload.invoiceNumber || snap.data()?.invoiceNumber || invoiceId
    );
    return {
      message: `Updated invoice "${label}" status: ${prev || "?"} → ${status}.`,
    };
  }

  throw new Error(`Unsupported Lexi action type: ${type}`);
}
