import { ImapFlow } from "imapflow";
import MailComposer from "nodemailer/lib/mail-composer";
import {
  imapHostFallbacks,
  readImapConnectionFromEnv,
  readImapMailboxesFromEnv,
} from "@/lib/imap-mailboxes";

type SentCopySmtpConfig = {
  user: string;
  from: string;
  fromName: string;
};

async function buildRawMime(options: {
  from: string;
  to: string;
  cc?: string;
  subject: string;
  message: string;
  html?: string;
  messageId?: string;
  attachments: { filename: string; content: Buffer }[];
}): Promise<Buffer> {
  const composer = new MailComposer({
    from: options.from,
    to: options.to,
    ...(options.cc?.trim() ? { cc: options.cc.trim() } : {}),
    subject: options.subject,
    text: options.message,
    ...(options.html ? { html: options.html } : {}),
    ...(options.messageId ? { messageId: options.messageId } : {}),
    attachments: options.attachments.map((file) => ({
      filename: file.filename,
      content: file.content,
    })),
  });
  return composer.compile().build();
}

async function resolveSentMailboxPath(client: ImapFlow): Promise<string> {
  const boxes = await client.list();
  const bySpecial = boxes.find((box) => box.specialUse === "\\Sent");
  if (bySpecial?.path) return bySpecial.path;

  const byName = boxes.find((box) =>
    /^(sent|sent items|sent messages|inbox\.sent)$/i.test(String(box.path || "").trim())
  );
  if (byName?.path) return byName.path;

  const loose = boxes.find((box) => /sent/i.test(String(box.path || "")));
  if (loose?.path) return loose.path;

  return "Sent";
}

/**
 * Best-effort: copy the outbound message into Hostinger/Titan Sent via IMAP.
 * Skips append when Message-ID is already present (provider auto-filed).
 */
export async function saveSentCopyViaImap(options: {
  config: SentCopySmtpConfig;
  to: string;
  cc?: string;
  subject: string;
  message: string;
  html?: string;
  messageId?: string;
  attachments: { filename: string; content: Buffer }[];
}): Promise<{
  saved: boolean;
  alreadyPresent?: boolean;
  path?: string;
  error?: string;
}> {
  const conn = readImapConnectionFromEnv();
  const mailboxes = readImapMailboxesFromEnv();
  const smtpUser = options.config.user.toLowerCase();
  const mailbox =
    mailboxes.find((mb) => mb.user.toLowerCase() === smtpUser) ||
    mailboxes.find((mb) => mb.id === "info") ||
    null;

  if (!conn || !mailbox) {
    return { saved: false, error: "IMAP mailbox for SMTP user is not configured." };
  }

  const fromHeader = options.config.fromName
    ? `${options.config.fromName} <${options.config.from}>`
    : options.config.from;

  const raw = await buildRawMime({
    from: fromHeader,
    to: options.to,
    cc: options.cc,
    subject: options.subject,
    message: options.message,
    html: options.html,
    messageId: options.messageId,
    attachments: options.attachments,
  });

  let lastError: unknown;
  for (const host of imapHostFallbacks(mailbox.host || conn.host)) {
    const client = new ImapFlow({
      host,
      port: mailbox.port || conn.port,
      secure: mailbox.secure ?? conn.secure,
      auth: {
        user: mailbox.user,
        pass: mailbox.password,
      },
      logger: false,
      tls: {
        rejectUnauthorized: false,
      },
    });

    try {
      await client.connect();
      const path = await resolveSentMailboxPath(client);

      if (options.messageId) {
        const lock = await client.getMailboxLock(path);
        try {
          const existing = await client.search(
            { header: { "message-id": options.messageId } },
            { uid: true }
          );
          if (Array.isArray(existing) && existing.length > 0) {
            return { saved: false, alreadyPresent: true, path };
          }
        } catch {
          /* search optional — still try append */
        } finally {
          lock.release();
        }
      }

      await client.append(path, raw, ["\\Seen"]);
      return { saved: true, path };
    } catch (error) {
      lastError = error;
      console.warn(
        `[IMAP] Save-to-Sent failed on ${host} for ${mailbox.user}:`,
        error instanceof Error ? error.message : error
      );
    } finally {
      try {
        await client.logout();
      } catch {
        /* ignore */
      }
    }
  }

  return {
    saved: false,
    error:
      lastError instanceof Error
        ? lastError.message
        : "Failed to append message to Sent folder.",
  };
}
