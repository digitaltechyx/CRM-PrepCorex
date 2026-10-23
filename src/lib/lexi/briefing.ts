import { adminDb } from "@/lib/firebase-admin";
import { CRM_LEADS_COLLECTION } from "@/lib/crm/types";
import { STATUS_LABELS, type SystemLeadStatus } from "@/lib/crm-lead-schema";
import { createLexiMessage, listLexiMessages } from "@/lib/lexi/messages";
import { lexiChatCompletion } from "@/lib/lexi/openai";
import { LEXI_SYSTEM_PROMPT } from "@/lib/lexi/prompt";
import { buildCrmSnapshotForLexi } from "@/lib/lexi/crm-snapshot";
import {
  LEXI_STATE_COLLECTION,
  LEXI_STATE_DOC,
} from "@/lib/lexi/types";

type LeadRow = {
  id: string;
  leadName?: string;
  status?: string;
  nextFollowUpAt?: string;
  email?: string;
  phone?: string;
  company?: string;
};

function labelStatus(status?: string) {
  const id = String(status || "").trim();
  if (!id) return "Unknown";
  return STATUS_LABELS[id as SystemLeadStatus] || id;
}

/**
 * Scan full CRM and post actionable Lexi messages (leads + quotes + invoices + contacts).
 */
export async function lexiLeadBriefing(limit = 8): Promise<{
  posted: number;
  appreciated: boolean;
}> {
  const [leadsSnap, quotesSnap, invoicesSnap, contactsSnap, snapshot] =
    await Promise.all([
      adminDb().collection(CRM_LEADS_COLLECTION).get(),
      adminDb().collection("quotes").select("status", "quoteNumber", "clientName").limit(80).get(),
      adminDb()
        .collection("external_invoices")
        .select("status", "invoiceNumber", "clientName", "outstandingBalance")
        .limit(80)
        .get(),
      adminDb().collection("crm_contacts").select("name", "email").limit(40).get(),
      buildCrmSnapshotForLexi(),
    ]);

  const leads: LeadRow[] = leadsSnap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<LeadRow, "id">),
  }));

  const today = new Date().toISOString().slice(0, 10);
  const stateSnap = await adminDb()
    .collection(LEXI_STATE_COLLECTION)
    .doc(LEXI_STATE_DOC)
    .get();
  const state = (stateSnap.exists ? stateSnap.data() : {}) as {
    leadBriefKeys?: string[];
    lastAppreciationDay?: string;
  };
  const briefKeys = new Set(state.leadBriefKeys || []);

  const actionable = leads
    .filter((l) => {
      const status = String(l.status || "").toLowerCase();
      if (!status) return true;
      if (/won|lost|closed|spam|rejected|dead|client/i.test(status)) return false;
      return true;
    })
    .slice(0, Math.max(limit, 12));

  let posted = 0;
  const newKeys = [...briefKeys];

  const key = `crm_briefing:${today}`;
  if (!briefKeys.has(key)) {
    const advice = await lexiChatCompletion({
      messages: [
        {
          role: "system",
          content: `${LEXI_SYSTEM_PROMPT}\n\nWrite a short CRM briefing for the admin (max 220 words). Cover priorities across leads/pipeline, mailbox drafts, address book, quotes, and invoices using the snapshot. Be encouraging. Plain text only. Do NOT append LEXI_ACTION.`,
        },
        {
          role: "user",
          content: `Today is ${today}. Live CRM snapshot:\n${snapshot}`,
        },
      ],
      temperature: 0.45,
      maxTokens: 650,
    });

    await createLexiMessage({
      type: "crm_briefing",
      title: "Lexi’s CRM priorities for today",
      body: advice,
      href: "/dashboard",
      meta: {
        day: today,
        leadsTotal: leadsSnap.size,
        contactsTotal: contactsSnap.size,
        quotesTotal: quotesSnap.size,
        invoicesTotal: invoicesSnap.size,
      },
    });
    newKeys.push(key);
    posted += 1;
  }

  for (const lead of actionable.slice(0, 5)) {
    const follow = String(lead.nextFollowUpAt || "");
    const overdue =
      follow &&
      follow.slice(0, 10) <= today &&
      !/won|lost|closed|dead|client/i.test(String(lead.status || ""));
    const isNew = /new_lead|new|contact/i.test(String(lead.status || "new_lead"));
    if (!overdue && !isNew) continue;
    const leadKey = `lead:${lead.id}:${today}:${overdue ? "overdue" : "new"}`;
    if (briefKeys.has(leadKey)) continue;
    await createLexiMessage({
      type: "lead_action",
      title: overdue
        ? `Follow up due: ${lead.leadName || "Lead"}`
        : `New lead to contact: ${lead.leadName || "Lead"}`,
      body: overdue
        ? `Please complete today’s follow-up for ${lead.leadName || "this lead"} (${labelStatus(lead.status)}). After you finish, Lexi can help draft the next step and move the pipeline.`
        : `Please reach out to ${lead.leadName || "this lead"}${lead.email ? ` (${lead.email})` : ""}. When you’re done, mark the activity in Leads — Lexi will suggest the next follow-up.`,
      href: "/dashboard/leads",
      meta: { leadId: lead.id, status: lead.status },
    });
    newKeys.push(leadKey);
    posted += 1;
  }

  const openQuotes = quotesSnap.docs.filter((d) => {
    const s = String(d.data().status || "").toLowerCase();
    return !/paid|accepted|won|closed|void|cancelled|rejected/i.test(s);
  });
  const quoteKey = `quotes_tip:${today}`;
  if (openQuotes.length > 0 && !briefKeys.has(quoteKey)) {
    const sample = openQuotes
      .slice(0, 4)
      .map((d) => {
        const x = d.data();
        return `${x.quoteNumber || d.id} (${x.clientName || "?"}: ${x.status || "?"})`;
      })
      .join("; ");
    await createLexiMessage({
      type: "quote_tip",
      title: `${openQuotes.length} quote${openQuotes.length === 1 ? "" : "s"} need attention`,
      body: `Check Quote management for open quotes. Examples: ${sample}. Lexi can help you prioritize follow-ups or draft a chase email (to Drafts for your review).`,
      href: "/dashboard/quotes",
      meta: { openCount: openQuotes.length, day: today },
    });
    newKeys.push(quoteKey);
    posted += 1;
  }

  const openInvoices = invoicesSnap.docs.filter((d) => {
    const x = d.data();
    const s = String(x.status || "").toLowerCase();
    const bal = Number(x.outstandingBalance ?? 0);
    if (/paid|void|cancelled/i.test(s)) return false;
    return bal > 0 || /open|sent|overdue|unpaid|partial/i.test(s);
  });
  const invKey = `invoices_tip:${today}`;
  if (openInvoices.length > 0 && !briefKeys.has(invKey)) {
    const sample = openInvoices
      .slice(0, 4)
      .map((d) => {
        const x = d.data();
        return `${x.invoiceNumber || d.id} (${x.clientName || "?"})`;
      })
      .join("; ");
    await createLexiMessage({
      type: "invoice_tip",
      title: `${openInvoices.length} invoice${openInvoices.length === 1 ? "" : "s"} to review`,
      body: `Review Invoice management for outstanding balances. Examples: ${sample}. Ask Lexi in chat for a payment-follow-up tip — she’ll keep any email in Drafts until you approve.`,
      href: "/dashboard/invoice-portal",
      meta: { openCount: openInvoices.length, day: today },
    });
    newKeys.push(invKey);
    posted += 1;
  }

  const contactsKey = `contacts_tip:${today}`;
  if (contactsSnap.size > 0 && !briefKeys.has(contactsKey)) {
    await createLexiMessage({
      type: "address_book",
      title: `Address book: ${contactsSnap.size} contacts`,
      body: `You have ${contactsSnap.size} contacts in the address book. Spot-check recent adds for missing email/company, and link warm contacts back to pipeline leads when they’re ready for quotes. Ask Lexi in chat for a short cleanup plan.`,
      href: "/dashboard/contacts",
      meta: { contactsTotal: contactsSnap.size, day: today },
    });
    newKeys.push(contactsKey);
    posted += 1;
  }

  let appreciated = false;
  if (state.lastAppreciationDay !== today) {
    const recent = await listLexiMessages({ limit: 20 });
    const hasUnreadWork = recent.some((m) => !m.read && m.type !== "appreciation");
    if (!hasUnreadWork && leads.length > 0) {
      await createLexiMessage({
        type: "appreciation",
        title: "Nice work keeping PrepCorex CRM moving",
        body: "You’re staying on top of leads, quotes, and inbox. Ask Lexi anytime about pipeline, address book, quotes, or invoices — she’ll propose changes for your approval before writing anything.",
        href: "/dashboard",
      });
      appreciated = true;
      posted += 1;
    }
    await adminDb()
      .collection(LEXI_STATE_COLLECTION)
      .doc(LEXI_STATE_DOC)
      .set(
        {
          leadBriefKeys: newKeys.slice(-200),
          lastAppreciationDay: today,
          lastBriefingAt: new Date().toISOString(),
        },
        { merge: true }
      );
  } else if (posted > 0) {
    await adminDb()
      .collection(LEXI_STATE_COLLECTION)
      .doc(LEXI_STATE_DOC)
      .set(
        {
          leadBriefKeys: newKeys.slice(-200),
          lastBriefingAt: new Date().toISOString(),
        },
        { merge: true }
      );
  }

  return { posted, appreciated };
}
