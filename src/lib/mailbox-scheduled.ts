import { adminDb } from "@/lib/firebase-admin";
import { readSmtpConfigFromEnv, sendSmtpMail } from "@/lib/smtp-transport";
import {
  buildMailboxHtml,
  ensurePlainSignature,
} from "@/lib/mailbox-signature";

export const MAILBOX_SCHEDULED_COLLECTION = "crmMailboxScheduled";

export type CrmMailboxScheduled = {
  id: string;
  to: string;
  cc?: string;
  subject: string;
  message: string;
  html?: string;
  attachments?: Array<{ filename: string; contentBase64: string }>;
  scheduledFor: string;
  scheduledForMs: number;
  status: "pending" | "sent" | "failed" | "cancelled";
  error?: string;
  createdAt: string;
  sentAt?: string;
  createdByUid?: string;
};

function decodeAttachments(
  list?: Array<{ filename: string; contentBase64: string }>
) {
  return (list || []).map((a) => ({
    filename: a.filename,
    content: Buffer.from(a.contentBase64, "base64"),
  }));
}

export async function listPendingScheduled(limit = 50): Promise<CrmMailboxScheduled[]> {
  const snap = await adminDb()
    .collection(MAILBOX_SCHEDULED_COLLECTION)
    .where("status", "==", "pending")
    .orderBy("scheduledForMs", "asc")
    .limit(limit)
    .get();
  return snap.docs.map((d) => d.data() as CrmMailboxScheduled);
}

export async function createScheduledMessage(input: {
  to: string;
  cc?: string;
  subject: string;
  message: string;
  html?: string;
  attachments?: Array<{ filename: string; contentBase64: string }>;
  scheduledFor: Date;
  createdByUid?: string;
}): Promise<CrmMailboxScheduled> {
  const ref = adminDb().collection(MAILBOX_SCHEDULED_COLLECTION).doc();
  const plain = ensurePlainSignature(input.message);
  const now = new Date();
  const doc: CrmMailboxScheduled = {
    id: ref.id,
    to: input.to,
    ...(input.cc?.trim() ? { cc: input.cc.trim() } : {}),
    subject: input.subject || "(no subject)",
    message: plain,
    html: input.html || buildMailboxHtml(plain),
    attachments: input.attachments?.length ? input.attachments : undefined,
    scheduledFor: input.scheduledFor.toISOString(),
    scheduledForMs: input.scheduledFor.getTime(),
    status: "pending",
    createdAt: now.toISOString(),
    createdByUid: input.createdByUid,
  };
  await ref.set(doc);
  return doc;
}

/** Send any pending scheduled messages that are due. Safe to call from sync. */
export async function processDueScheduledMessages(limit = 20): Promise<{
  processed: number;
  sent: number;
  failed: number;
}> {
  const smtpConfig = readSmtpConfigFromEnv();
  if (!smtpConfig) return { processed: 0, sent: 0, failed: 0 };

  const nowMs = Date.now();
  const snap = await adminDb()
    .collection(MAILBOX_SCHEDULED_COLLECTION)
    .where("status", "==", "pending")
    .where("scheduledForMs", "<=", nowMs)
    .orderBy("scheduledForMs", "asc")
    .limit(limit)
    .get()
    .catch(async () => {
      // Fallback if composite index missing: filter in memory
      const all = await adminDb()
        .collection(MAILBOX_SCHEDULED_COLLECTION)
        .where("status", "==", "pending")
        .limit(100)
        .get();
      return {
        docs: all.docs
          .filter((d) => Number(d.data().scheduledForMs || 0) <= nowMs)
          .sort(
            (a, b) =>
              Number(a.data().scheduledForMs || 0) -
              Number(b.data().scheduledForMs || 0)
          )
          .slice(0, limit),
      };
    });

  let sent = 0;
  let failed = 0;
  for (const doc of snap.docs) {
    const data = doc.data() as CrmMailboxScheduled;
    try {
      const plain = ensurePlainSignature(data.message);
      await sendSmtpMail({
        config: smtpConfig,
        to: data.to,
        cc: data.cc,
        subject: data.subject,
        message: plain,
        html: data.html || buildMailboxHtml(plain),
        attachments: decodeAttachments(data.attachments),
      });
      await doc.ref.set(
        {
          status: "sent",
          sentAt: new Date().toISOString(),
          error: null,
        },
        { merge: true }
      );
      sent += 1;
    } catch (error) {
      failed += 1;
      await doc.ref.set(
        {
          status: "failed",
          error: error instanceof Error ? error.message : "Send failed",
        },
        { merge: true }
      );
    }
  }

  return { processed: snap.docs.length, sent, failed };
}
