import { NextRequest, NextResponse } from "next/server";
import { requireMailboxAdmin } from "@/lib/mailbox-auth";
import { readSmtpConfigFromEnv, sendSmtpMail } from "@/lib/smtp-transport";
import { saveMailboxDraft, syncInfoMailbox } from "@/lib/mailbox-imap";
import { adminDb } from "@/lib/firebase-admin";
import { MAILBOX_COLLECTION } from "@/lib/mailbox-types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const auth = await requireMailboxAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const to = String(body?.to || "").trim();
    const subject = String(body?.subject || "").trim();
    const message = String(body?.message || "");
    const asDraft = Boolean(body?.draft);

    if (!to) {
      return NextResponse.json({ error: "Recipient (to) is required." }, { status: 400 });
    }

    if (asDraft) {
      const draft = await saveMailboxDraft({ to, subject, message });
      if (!draft.saved) {
        return NextResponse.json(
          { error: draft.error || "Failed to save draft on Hostinger." },
          { status: 500 }
        );
      }
      // Pull drafts so it appears in CRM immediately
      await syncInfoMailbox({ folders: ["drafts"], limit: 20 }).catch(() => undefined);
      return NextResponse.json({ success: true, draft: true });
    }

    const smtpConfig = readSmtpConfigFromEnv();
    if (!smtpConfig) {
      return NextResponse.json({ error: "SMTP is not configured." }, { status: 500 });
    }

    const sendResult = await sendSmtpMail({
      config: smtpConfig,
      to,
      subject: subject || "(no subject)",
      message,
      attachments: [],
    });

    // Optimistic CRM Sent row (IMAP Sent sync will reconcile on next Sync)
    const now = new Date();
    const optimisticId = `info_sent_local_${now.getTime()}`;
    await adminDb()
      .collection(MAILBOX_COLLECTION)
      .doc(optimisticId)
      .set({
        id: optimisticId,
        mailboxId: "info",
        mailboxEmail: smtpConfig.user,
        folder: "sent",
        imapFolder: sendResult.sentPath || "INBOX.Sent",
        uid: 0,
        subject: subject || "(no subject)",
        from: smtpConfig.from,
        fromName: smtpConfig.fromName,
        to,
        date: now.toISOString(),
        dateMs: now.getTime(),
        snippet: message.replace(/\s+/g, " ").trim().slice(0, 180),
        textBody: message,
        seen: true,
        flagged: false,
        hasAttachments: false,
        syncedAt: now.toISOString(),
        localOptimistic: true,
      });

    await syncInfoMailbox({ folders: ["sent"], limit: 15 }).catch(() => undefined);

    return NextResponse.json({
      success: true,
      sentSaved: sendResult.sentSaved,
      sentPath: sendResult.sentPath,
    });
  } catch (error) {
    console.error("[Mailbox send]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to send email" },
      { status: 500 }
    );
  }
}
