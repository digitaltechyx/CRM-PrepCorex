import { adminDb } from "@/lib/firebase-admin";
import { listMailboxMessages, saveMailboxDraft } from "@/lib/mailbox-imap";
import { ensurePlainSignature } from "@/lib/mailbox-signature";
import { lexiChatCompletion } from "@/lib/lexi/openai";
import { buildEmailDraftSystemPrompt } from "@/lib/lexi/prompt";
import { createLexiMessage } from "@/lib/lexi/messages";
import {
  LEXI_STATE_COLLECTION,
  LEXI_STATE_DOC,
} from "@/lib/lexi/types";
import type { CrmMailboxMessage } from "@/lib/mailbox-types";

type LexiState = {
  draftedInboxIds?: string[];
  lastEmailDraftRunAt?: string;
};

function parseDraftJson(raw: string): {
  subject: string;
  body: string;
  summary: string;
  shouldDraft: boolean;
} {
  const cleaned = raw.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  try {
    const data = JSON.parse(cleaned);
    return {
      subject: String(data.subject || "Re: (no subject)").trim(),
      body: String(data.body || "").trim(),
      summary: String(data.summary || "Draft ready for review.").trim(),
      shouldDraft: data.shouldDraft !== false,
    };
  } catch {
    return {
      subject: "Re: your message",
      body: raw.slice(0, 4000),
      summary: "Draft ready for review.",
      shouldDraft: true,
    };
  }
}

function normalizeMessageId(id?: string | null): string {
  return String(id || "")
    .trim()
    .toLowerCase()
    .replace(/^<|>$/g, "");
}

function normalizeSubject(subject: string): string {
  return String(subject || "")
    .replace(/^(re|fwd|fw):\s*/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function extractEmail(raw: string): string {
  const match = String(raw || "").match(
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/
  );
  return (match?.[0] || "").toLowerCase().trim();
}

/**
 * True if admin already sent a reply for this inbound message
 * (In-Reply-To match, or same thread subject to the client after the inbound arrived).
 * A later client reply on the same thread is a new inbox id — still gets a draft.
 */
function adminAlreadyReplied(
  inboxMsg: CrmMailboxMessage,
  sentMessages: CrmMailboxMessage[]
): boolean {
  const clientEmail = extractEmail(inboxMsg.from);
  if (!clientEmail) return false;

  const inboxMid = normalizeMessageId(inboxMsg.messageId);
  const threadSubject = normalizeSubject(inboxMsg.subject);
  const inboxTime = Number(inboxMsg.dateMs || 0);

  for (const sent of sentMessages) {
    const sentTime = Number(sent.dateMs || 0);
    // Must be at/after this inbound (admin reply can't precede the mail we're answering)
    if (inboxTime && sentTime && sentTime + 30_000 < inboxTime) continue;

    const sentInReplyTo = normalizeMessageId(sent.inReplyTo);
    if (inboxMid && sentInReplyTo && sentInReplyTo === inboxMid) {
      return true;
    }

    const sentTo = String(sent.to || "").toLowerCase();
    const toClient =
      extractEmail(sent.to) === clientEmail || sentTo.includes(clientEmail);
    if (!toClient) continue;

    if (
      threadSubject &&
      normalizeSubject(sent.subject) === threadSubject &&
      sentTime >= inboxTime - 5_000
    ) {
      return true;
    }
  }

  return false;
}

async function readState(): Promise<LexiState> {
  const snap = await adminDb()
    .collection(LEXI_STATE_COLLECTION)
    .doc(LEXI_STATE_DOC)
    .get();
  return (snap.exists ? snap.data() : {}) as LexiState;
}

async function writeState(patch: LexiState): Promise<void> {
  await adminDb()
    .collection(LEXI_STATE_COLLECTION)
    .doc(LEXI_STATE_DOC)
    .set(patch, { merge: true });
}

/**
 * Review recent inbox messages and save Hostinger drafts + Lexi notifications.
 * Skips: already processed by Lexi, noise senders, admin-already-replied.
 * New replies on the same thread (new inbox ids) still get drafts.
 */
export async function lexiDraftRepliesForNewInbox(limit = 5): Promise<{
  scanned: number;
  drafted: number;
  skipped: number;
  skippedAdminReplied: number;
  errors: string[];
}> {
  const state = await readState();
  const already = new Set(state.draftedInboxIds || []);
  const [inbox, sent] = await Promise.all([
    listMailboxMessages({ folder: "inbox", limit: 25 }),
    listMailboxMessages({ folder: "sent", limit: 60 }),
  ]);
  const candidates = inbox
    .filter((m) => !already.has(m.id))
    .slice(0, Math.min(limit, 8));

  let drafted = 0;
  let skipped = 0;
  let skippedAdminReplied = 0;
  const errors: string[] = [];
  const newlyDrafted = [...already];

  for (const msg of candidates) {
    try {
      const fromNoise =
        /noreply|no-reply|donotreply|mailer-daemon|notifications?@/i.test(
          msg.from || ""
        );
      if (
        fromNoise &&
        !/prepservicesfba|quote|invoice|shipment|inbound/i.test(msg.subject || "")
      ) {
        newlyDrafted.push(msg.id);
        skipped += 1;
        continue;
      }

      if (adminAlreadyReplied(msg, sent)) {
        newlyDrafted.push(msg.id);
        skipped += 1;
        skippedAdminReplied += 1;
        continue;
      }

      const userContent = [
        `From: ${msg.fromName ? `${msg.fromName} <${msg.from}>` : msg.from}`,
        `To: ${msg.to || ""}`,
        `Subject: ${msg.subject}`,
        `Date: ${msg.date}`,
        "",
        "Email body:",
        (msg.textBody || msg.snippet || "").slice(0, 6000),
      ].join("\n");

      const raw = await lexiChatCompletion({
        messages: [
          { role: "system", content: buildEmailDraftSystemPrompt() },
          { role: "user", content: userContent },
        ],
        temperature: 0.4,
        maxTokens: 1400,
      });

      const draft = parseDraftJson(raw);
      newlyDrafted.push(msg.id);

      if (!draft.shouldDraft || !draft.body.trim()) {
        skipped += 1;
        await createLexiMessage({
          type: "general",
          title: `No reply needed: ${msg.subject.slice(0, 80)}`,
          body:
            draft.summary ||
            "Lexi reviewed this inbox message and did not draft a reply.",
          href: "/dashboard/mailbox",
          meta: { inboxMessageId: msg.id, from: msg.from },
        });
        continue;
      }

      const body = ensurePlainSignature(draft.body);
      const subject = draft.subject.startsWith("Re:")
        ? draft.subject
        : `Re: ${msg.subject || draft.subject}`;

      const saved = await saveMailboxDraft({
        to: msg.from,
        subject,
        message: body,
      });

      if (!saved.saved) {
        errors.push(saved.error || `Draft failed for ${msg.id}`);
        continue;
      }

      drafted += 1;
      await createLexiMessage({
        type: "draft_ready",
        title: `Email draft ready: ${subject.slice(0, 90)}`,
        body: `${draft.summary}\n\nTo: ${msg.from}\nOpen Mailbox → Drafts to review and send.`,
        href: "/dashboard/mailbox",
        meta: {
          inboxMessageId: msg.id,
          from: msg.from,
          subject,
        },
      });
    } catch (error) {
      errors.push(
        error instanceof Error ? error.message : `Failed on ${msg.id}`
      );
    }
  }

  const trimmed = newlyDrafted.slice(-300);
  await writeState({
    draftedInboxIds: trimmed,
    lastEmailDraftRunAt: new Date().toISOString(),
  });

  return {
    scanned: candidates.length,
    drafted,
    skipped,
    skippedAdminReplied,
    errors,
  };
}
