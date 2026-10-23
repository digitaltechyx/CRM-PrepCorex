import { adminDb } from "@/lib/firebase-admin";
import { CRM_LEADS_COLLECTION } from "@/lib/crm/types";
import { STATUS_LABELS, type SystemLeadStatus } from "@/lib/crm-lead-schema";
import { MAILBOX_COLLECTION } from "@/lib/mailbox-types";
import { listLexiMessages } from "@/lib/lexi/messages";

function bump(map: Record<string, number>, key: string) {
  const k = (key || "unknown").trim() || "unknown";
  map[k] = (map[k] || 0) + 1;
}

function formatCounts(map: Record<string, number>): string {
  const entries = Object.entries(map).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return "(none)";
  return entries.map(([k, n]) => `${k}: ${n}`).join(", ");
}

function statusLabel(statusId: string): string {
  const id = String(statusId || "").trim();
  if (!id) return "Unknown";
  const known = STATUS_LABELS[id as SystemLeadStatus];
  return known || id;
}

/**
 * Accurate live CRM snapshot for Lexi (full counts, not a small sample).
 */
export async function buildCrmSnapshotForLexi(): Promise<string> {
  const db = adminDb();

  const [leadsSnap, contactsSnap, quotesSnap, invoicesSnap, inboxSnap, unread] =
    await Promise.all([
      db
        .collection(CRM_LEADS_COLLECTION)
        .select("leadName", "status", "nextFollowUpAt", "company", "email", "phone")
        .get(),
      db.collection("crm_contacts").select("name", "email", "company", "phone").get(),
      db.collection("quotes").select("status", "quoteNumber", "clientName", "total").get(),
      db
        .collection("external_invoices")
        .select("status", "invoiceNumber", "clientName", "total", "outstandingBalance")
        .get(),
      db
        .collection(MAILBOX_COLLECTION)
        .where("folder", "==", "inbox")
        .select("seen", "subject", "from")
        .limit(200)
        .get()
        .catch(() => null),
      listLexiMessages({ limit: 12, unreadOnly: true }),
    ]);

  const statusCounts: Record<string, number> = {};
  const byStatus: Record<
    string,
    Array<{ id: string; name: string; company: string; followUp: string }>
  > = {};
  const followUpDue: Array<{ name: string; status: string; followUp: string }> = [];
  const today = new Date().toISOString().slice(0, 10);

  for (const doc of leadsSnap.docs) {
    const x = doc.data();
    const statusId = String(x.status || "new_lead").trim() || "new_lead";
    bump(statusCounts, statusId);
    if (!byStatus[statusId]) byStatus[statusId] = [];
    byStatus[statusId].push({
      id: doc.id,
      name: String(x.leadName || doc.id),
      company: String(x.company || "—"),
      followUp: String(x.nextFollowUpAt || "—"),
    });
    const fu = String(x.nextFollowUpAt || "").slice(0, 10);
    if (fu && fu <= today) {
      followUpDue.push({
        name: String(x.leadName || doc.id),
        status: statusLabel(statusId),
        followUp: fu,
      });
    }
  }

  const statusBreakdown = Object.entries(statusCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([statusId, count]) => {
      const rows = byStatus[statusId] || [];
      const names = rows
        .slice(0, 12)
        .map((r) => `${r.name} [${r.id}]`)
        .join("; ");
      const more = rows.length > 12 ? ` (+${rows.length - 12} more)` : "";
      return `- ${statusLabel(statusId)} (id=${statusId}): ${count} — ${names || "(none)"}${more}`;
    })
    .join("\n");

  const quoteStatus: Record<string, number> = {};
  for (const doc of quotesSnap.docs) {
    bump(quoteStatus, String(doc.data().status || "unknown"));
  }

  const invoiceStatus: Record<string, number> = {};
  let outstandingApprox = 0;
  for (const doc of invoicesSnap.docs) {
    const x = doc.data();
    bump(invoiceStatus, String(x.status || "unknown"));
    const bal = Number(x.outstandingBalance ?? x.total ?? 0);
    if (Number.isFinite(bal) && bal > 0) outstandingApprox += bal;
  }

  let inboxUnread = 0;
  let inboxTotal = 0;
  if (inboxSnap) {
    inboxTotal = inboxSnap.size;
    for (const doc of inboxSnap.docs) {
      if (!doc.data().seen) inboxUnread += 1;
    }
  }

  const dueList = followUpDue
    .slice(0, 20)
    .map((l) => `- ${l.name} (${l.status}) due ${l.followUp}`)
    .join("\n");

  const contactSample = contactsSnap.docs
    .slice(0, 20)
    .map((d) => {
      const x = d.data();
      return `- [${d.id}] ${x.name || "?"} | ${x.company || "—"} | ${x.email || x.phone || ""}`;
    })
    .join("\n");

  const quoteSample = quotesSnap.docs
    .slice(0, 15)
    .map((d) => {
      const x = d.data();
      return `- [${d.id}] ${x.quoteNumber || d.id} | ${x.clientName || "?"} | ${x.status || "?"} | $${x.total ?? "?"}`;
    })
    .join("\n");

  const invoiceSample = invoicesSnap.docs
    .slice(0, 15)
    .map((d) => {
      const x = d.data();
      return `- [${d.id}] ${x.invoiceNumber || d.id} | ${x.clientName || "?"} | ${x.status || "?"} | outstanding≈$${x.outstandingBalance ?? x.total ?? "?"}`;
    })
    .join("\n");

  const notes = unread
    .map((m) => `- [${m.type}] ${m.title}`)
    .join("\n");

  return [
    "=== LIVE CRM SNAPSHOT (source of truth — use these numbers; do not invent) ===",
    `Leads TOTAL in CRM (matches pipeline board): ${leadsSnap.size}`,
    "Leads by pipeline status (label, id, count, sample names with [id]):",
    statusBreakdown || "(no leads)",
    followUpDue.length
      ? `Follow-ups due/overdue (up to 20 of ${followUpDue.length}):\n${dueList}`
      : "Follow-ups due/overdue: none in snapshot",
    `Address book contacts TOTAL: ${contactsSnap.size}`,
    `Quotes TOTAL: ${quotesSnap.size} (${formatCounts(quoteStatus)})`,
    `External invoices TOTAL: ${invoicesSnap.size} (${formatCounts(invoiceStatus)}); sum outstanding fields ≈ $${outstandingApprox.toFixed(2)}`,
    `Mailbox inbox (synced sample up to 200): total=${inboxTotal}, unread≈${inboxUnread}`,
    "",
    "Contacts sample:",
    contactSample || "(none)",
    "",
    "Quotes sample:",
    quoteSample || "(none)",
    "",
    "Invoices sample:",
    invoiceSample || "(none)",
    "",
    notes ? `Unread Lexi notices:\n${notes}` : "Unread Lexi notices: none",
    "=== END SNAPSHOT ===",
  ].join("\n");
}
