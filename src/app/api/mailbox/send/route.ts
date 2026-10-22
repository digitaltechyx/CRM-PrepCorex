import { NextRequest, NextResponse } from "next/server";
import { requireMailboxAdmin } from "@/lib/mailbox-auth";
import { readSmtpConfigFromEnv, sendSmtpMail } from "@/lib/smtp-transport";
import {
  purgeOptimisticSentDuplicates,
  saveMailboxDraft,
  syncInfoMailbox,
} from "@/lib/mailbox-imap";
import { adminDb } from "@/lib/firebase-admin";
import { MAILBOX_COLLECTION } from "@/lib/mailbox-types";
import {
  buildMailboxHtml,
  ensurePlainSignature,
} from "@/lib/mailbox-signature";
import { createScheduledMessage } from "@/lib/mailbox-scheduled";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type AttachmentInput = { filename: string; contentBase64: string };

function parseAttachments(raw: unknown): {
  buffers: { filename: string; content: Buffer }[];
  stored: AttachmentInput[];
} {
  if (!Array.isArray(raw)) return { buffers: [], stored: [] };
  const stored: AttachmentInput[] = [];
  const buffers: { filename: string; content: Buffer }[] = [];
  let total = 0;
  for (const item of raw.slice(0, 10)) {
    const filename = String(item?.filename || "attachment").slice(0, 180);
    const contentBase64 = String(item?.contentBase64 || "");
    if (!contentBase64) continue;
    const content = Buffer.from(contentBase64, "base64");
    total += content.length;
    if (total > 12 * 1024 * 1024) break;
    buffers.push({ filename, content });
    stored.push({ filename, contentBase64 });
  }
  return { buffers, stored };
}

export async function POST(request: NextRequest) {
  const auth = await requireMailboxAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const to = String(body?.to || "").trim();
    const cc = String(body?.cc || "").trim();
    const subject = String(body?.subject || "").trim();
    const includeSignature = body?.includeSignature !== false;
    const messageRaw = String(body?.message || "");
    const message = includeSignature
      ? ensurePlainSignature(messageRaw)
      : messageRaw;
    const html =
      typeof body?.html === "string" && body.html.trim()
        ? String(body.html)
        : buildMailboxHtml(messageRaw, { includeSignature });
    const asDraft = Boolean(body?.draft);
    const scheduledForRaw = body?.scheduledFor
      ? String(body.scheduledFor)
      : "";
    const { buffers: attachments, stored: storedAttachments } =
      parseAttachments(body?.attachments);

    if (!to && !asDraft) {
      return NextResponse.json({ error: "Recipient (to) is required." }, { status: 400 });
    }
    if (asDraft && !to) {
      return NextResponse.json(
        { error: "Draft needs at least a To address." },
        { status: 400 }
      );
    }

    if (scheduledForRaw && !asDraft) {
      const when = new Date(scheduledForRaw);
      if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now() + 30_000) {
        return NextResponse.json(
          { error: "Pick a schedule time at least 30 seconds in the future." },
          { status: 400 }
        );
      }
      const scheduled = await createScheduledMessage({
        to,
        cc,
        subject,
        message,
        html,
        attachments: storedAttachments,
        scheduledFor: when,
        createdByUid: auth.uid,
      });
      return NextResponse.json({
        success: true,
        scheduled: true,
        id: scheduled.id,
        scheduledFor: scheduled.scheduledFor,
      });
    }

    if (asDraft) {
      const draft = await saveMailboxDraft({
        to,
        cc,
        subject,
        message,
        html,
        attachments,
      });
      if (!draft.saved) {
        return NextResponse.json(
          { error: draft.error || "Failed to save draft on Hostinger." },
          { status: 500 }
        );
      }
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
      cc: cc || undefined,
      subject: subject || "(no subject)",
      message,
      html,
      attachments,
    });

    const now = new Date();
    // Only keep a temporary local Sent row when Hostinger did not get a Sent copy.
    // Otherwise sync would show the same email twice (local + IMAP).
    if (!sendResult.sentSaved) {
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
          messageId: sendResult.messageId,
          subject: subject || "(no subject)",
          from: smtpConfig.from,
          fromName: smtpConfig.fromName,
          to,
          ...(cc ? { cc } : {}),
          date: now.toISOString(),
          dateMs: now.getTime(),
          snippet: message.replace(/\s+/g, " ").trim().slice(0, 180),
          textBody: message,
          htmlBody: html,
          seen: true,
          flagged: false,
          hasAttachments: attachments.length > 0,
          syncedAt: now.toISOString(),
          localOptimistic: true,
        });
    }

    await syncInfoMailbox({ folders: ["sent"], limit: 20 }).catch(() => undefined);
    await purgeOptimisticSentDuplicates().catch(() => undefined);

    return NextResponse.json({
      success: true,
      sentSaved: sendResult.sentSaved,
      sentPath: sendResult.sentPath,
      messageId: sendResult.messageId,
    });
  } catch (error) {
    console.error("[Mailbox send]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to send email" },
      { status: 500 }
    );
  }
}
