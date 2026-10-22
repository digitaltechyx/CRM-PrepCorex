import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import {
  imapHostFallbacks,
  readImapConnectionFromEnv,
  readImapMailboxesFromEnv,
  type ImapMailboxConfig,
} from "@/lib/imap-mailboxes";
import {
  CRM_SETTINGS_COLLECTION,
  MAILBOX_COLLECTION,
  MAILBOX_SYNC_STATE_DOC,
  type CrmMailboxMessage,
  type MailboxFolderKey,
  type MailboxSyncFolderResult,
} from "@/lib/mailbox-types";
import { adminDb } from "@/lib/firebase-admin";

const BODY_MAX_CHARS = 80_000;
const SNIPPET_MAX_CHARS = 180;
const DEFAULT_SYNC_LIMIT = 40;

type FolderMap = Record<MailboxFolderKey, string>;

type SyncState = {
  mailboxes?: Record<
    string,
    {
      folders?: Record<string, { lastUid?: number; imapFolder?: string }>;
    }
  >;
};

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}…`;
}

function formatAddress(
  addr?: { name?: string | null; address?: string | null } | null
): { email: string; name?: string } {
  const email = String(addr?.address || "").trim().toLowerCase();
  const name = String(addr?.name || "").trim();
  return { email, name: name || undefined };
}

function formatAddressList(
  list?: Array<{ name?: string | null; address?: string | null }> | null
): string {
  if (!list?.length) return "";
  return list
    .map((a) => {
      const { email, name } = formatAddress(a);
      if (!email) return "";
      return name ? `${name} <${email}>` : email;
    })
    .filter(Boolean)
    .join(", ");
}

async function withImapClient<T>(
  mailbox: ImapMailboxConfig,
  fn: (client: ImapFlow) => Promise<T>
): Promise<T> {
  const conn = readImapConnectionFromEnv();
  if (!conn) throw new Error("IMAP is not configured.");

  const hosts = imapHostFallbacks(mailbox.host || conn.host);
  let lastError: unknown;

  for (const host of hosts) {
    const client = new ImapFlow({
      host,
      port: mailbox.port || conn.port,
      secure: mailbox.secure ?? conn.secure,
      auth: { user: mailbox.user, pass: mailbox.password },
      logger: false,
      tls: { rejectUnauthorized: false, minVersion: "TLSv1.2" },
    });
    try {
      await client.connect();
      return await fn(client);
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (
        /authentication failed|invalid login|LOGIN failed/i.test(message) &&
        host !== hosts.at(-1)
      ) {
        console.warn(`[Mailbox IMAP] Auth failed on ${host}, trying fallback…`);
        continue;
      }
      throw error;
    } finally {
      try {
        await client.logout();
      } catch {
        /* ignore */
      }
    }
  }

  throw lastError ?? new Error(`IMAP connection failed for ${mailbox.user}`);
}

export async function resolveMailboxFolderMap(
  client: ImapFlow
): Promise<FolderMap> {
  const boxes = await client.list();
  const find = (
    special: string,
    nameRegex: RegExp,
    fallback: string
  ): string => {
    const bySpecial = boxes.find((b) => b.specialUse === special);
    if (bySpecial?.path) return bySpecial.path;
    const byName = boxes.find((b) => nameRegex.test(String(b.path || "")));
    if (byName?.path) return byName.path;
    return fallback;
  };

  return {
    inbox: "INBOX",
    sent: find("\\Sent", /sent/i, "INBOX.Sent"),
    drafts: find("\\Drafts", /draft/i, "INBOX.Drafts"),
    spam: find("\\Junk", /(junk|spam)/i, "INBOX.Spam"),
  };
}

function docId(mailboxId: string, folder: MailboxFolderKey, uid: number): string {
  return `${mailboxId}_${folder}_${uid}`;
}

function getInfoMailbox(): ImapMailboxConfig {
  const mailboxes = readImapMailboxesFromEnv();
  const info =
    mailboxes.find((m) => m.id === "info") ||
    mailboxes.find((m) => /info@/i.test(m.user)) ||
    null;
  if (!info) {
    throw new Error(
      "info@ IMAP mailbox is not configured. Set IMAP_PASSWORD_INFO or SMTP_PASSWORD."
    );
  }
  return info;
}

async function upsertParsedMessage(input: {
  mailbox: ImapMailboxConfig;
  folder: MailboxFolderKey;
  imapFolder: string;
  uid: number;
  flags: Set<string> | string[];
  source: Buffer;
}): Promise<CrmMailboxMessage> {
  const parsed = await simpleParser(input.source);
  const from = formatAddress(parsed.from?.value?.[0]);
  const toList = Array.isArray(parsed.to)
    ? parsed.to.flatMap((part) => part.value || [])
    : parsed.to?.value || [];
  const ccList = Array.isArray(parsed.cc)
    ? parsed.cc.flatMap((part) => part.value || [])
    : parsed.cc?.value || [];
  const to = formatAddressList(toList);
  const cc = formatAddressList(ccList);
  const subject = String(parsed.subject || "(no subject)").trim() || "(no subject)";
  const textBody = truncate(String(parsed.text || ""), BODY_MAX_CHARS);
  const htmlBody = truncate(
    typeof parsed.html === "string" ? parsed.html : "",
    BODY_MAX_CHARS
  );
  const snippetSource = textBody || htmlBody.replace(/<[^>]+>/g, " ");
  const snippet = truncate(snippetSource.replace(/\s+/g, " ").trim(), SNIPPET_MAX_CHARS);
  const date = parsed.date && !Number.isNaN(parsed.date.getTime()) ? parsed.date : new Date();
  const flagSet = input.flags instanceof Set ? input.flags : new Set(input.flags || []);

  const message: CrmMailboxMessage = {
    id: docId(input.mailbox.id, input.folder, input.uid),
    mailboxId: input.mailbox.id,
    mailboxEmail: input.mailbox.user,
    folder: input.folder,
    imapFolder: input.imapFolder,
    uid: input.uid,
    messageId: parsed.messageId ? String(parsed.messageId) : undefined,
    subject,
    from: from.email || "unknown",
    fromName: from.name,
    to,
    cc: cc || undefined,
    date: date.toISOString(),
    dateMs: date.getTime(),
    snippet,
    textBody: textBody || undefined,
    htmlBody: htmlBody || undefined,
    seen: flagSet.has("\\Seen"),
    flagged: flagSet.has("\\Flagged"),
    hasAttachments: Boolean(parsed.attachments?.length),
    syncedAt: new Date().toISOString(),
  };

  const payload: Record<string, unknown> = { ...message };
  // Firestore rejects undefined
  for (const key of Object.keys(payload)) {
    if (payload[key] === undefined) delete payload[key];
  }

  await adminDb().collection(MAILBOX_COLLECTION).doc(message.id).set(payload, {
    merge: true,
  });

  return message;
}

async function syncFolder(input: {
  client: ImapFlow;
  mailbox: ImapMailboxConfig;
  folder: MailboxFolderKey;
  imapFolder: string;
  sinceUidExclusive: number;
  limit: number;
}): Promise<MailboxSyncFolderResult> {
  const { client, mailbox, folder, imapFolder, sinceUidExclusive, limit } = input;
  try {
    const lock = await client.getMailboxLock(imapFolder);
    try {
      const exists =
        client.mailbox && typeof client.mailbox === "object"
          ? Number(client.mailbox.exists || 0)
          : 0;
      if (!exists) {
        return { folder, imapFolder, synced: 0, lastUid: sinceUidExclusive };
      }

      const searchQuery =
        sinceUidExclusive > 0
          ? { uid: `${sinceUidExclusive + 1}:*` }
          : { all: true as const };

      let uids = await client.search(searchQuery, { uid: true });
      if (!Array.isArray(uids) || uids.length === 0) {
        // First sync: pull newest only
        if (sinceUidExclusive <= 0) {
          const all = await client.search({ all: true }, { uid: true });
          const sorted = (Array.isArray(all) ? all : []).sort((a, b) => a - b);
          uids = sorted.slice(-limit);
        } else {
          return { folder, imapFolder, synced: 0, lastUid: sinceUidExclusive };
        }
      } else {
        uids = [...uids].sort((a, b) => a - b);
        if (uids.length > limit) uids = uids.slice(-limit);
      }

      let synced = 0;
      let lastUid = sinceUidExclusive;

      for await (const msg of client.fetch(
        uids,
        { uid: true, flags: true, source: true },
        { uid: true }
      )) {
        if (typeof msg.uid !== "number" || !msg.source) continue;
        const source = Buffer.isBuffer(msg.source)
          ? msg.source
          : Buffer.from(msg.source);
        await upsertParsedMessage({
          mailbox,
          folder,
          imapFolder,
          uid: msg.uid,
          flags: msg.flags || new Set(),
          source,
        });
        synced += 1;
        if (msg.uid > lastUid) lastUid = msg.uid;
      }

      return { folder, imapFolder, synced, lastUid };
    } finally {
      lock.release();
    }
  } catch (error) {
    return {
      folder,
      imapFolder,
      synced: 0,
      lastUid: sinceUidExclusive,
      error: error instanceof Error ? error.message : "Folder sync failed",
    };
  }
}

export async function syncInfoMailbox(options?: {
  folders?: MailboxFolderKey[];
  limit?: number;
}): Promise<{
  mailboxEmail: string;
  folders: MailboxSyncFolderResult[];
}> {
  const mailbox = getInfoMailbox();
  const foldersToSync = options?.folders || (["inbox", "sent", "drafts", "spam"] as MailboxFolderKey[]);
  const limit = options?.limit || DEFAULT_SYNC_LIMIT;

  const stateRef = adminDb().collection(CRM_SETTINGS_COLLECTION).doc(MAILBOX_SYNC_STATE_DOC);
  const stateSnap = await stateRef.get();
  const state = (stateSnap.exists ? stateSnap.data() : {}) as SyncState;
  const mailboxState = state.mailboxes?.[mailbox.id] || { folders: {} };

  return withImapClient(mailbox, async (client) => {
    const folderMap = await resolveMailboxFolderMap(client);
    const results: MailboxSyncFolderResult[] = [];
    const nextFolders: Record<string, { lastUid?: number; imapFolder?: string }> = {
      ...(mailboxState.folders || {}),
    };

    for (const folder of foldersToSync) {
      const imapFolder = folderMap[folder];
      const prevUid = Number(nextFolders[folder]?.lastUid || 0);
      const result = await syncFolder({
        client,
        mailbox,
        folder,
        imapFolder,
        sinceUidExclusive: prevUid,
        limit,
      });
      results.push(result);
      if (!result.error) {
        nextFolders[folder] = {
          lastUid: Math.max(prevUid, result.lastUid),
          imapFolder,
        };
      }
    }

    await stateRef.set(
      {
        mailboxes: {
          ...(state.mailboxes || {}),
          [mailbox.id]: {
            folders: nextFolders,
            lastSyncedAt: new Date().toISOString(),
            mailboxEmail: mailbox.user,
          },
        },
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    return { mailboxEmail: mailbox.user, folders: results };
  });
}

export async function listMailboxMessages(input: {
  folder: MailboxFolderKey;
  limit?: number;
}): Promise<CrmMailboxMessage[]> {
  const mailbox = getInfoMailbox();
  const limit = Math.min(Math.max(input.limit || 50, 1), 200);
  // Avoid composite index requirement — filter then sort in memory.
  const snap = await adminDb()
    .collection(MAILBOX_COLLECTION)
    .where("mailboxId", "==", mailbox.id)
    .where("folder", "==", input.folder)
    .get();

  return snap.docs
    .map((doc) => {
      const data = doc.data() as CrmMailboxMessage;
      return { ...data, id: doc.id };
    })
    .sort((a, b) => Number(b.dateMs || 0) - Number(a.dateMs || 0))
    .slice(0, limit);
}

export async function getMailboxMessage(
  id: string
): Promise<CrmMailboxMessage | null> {
  const snap = await adminDb().collection(MAILBOX_COLLECTION).doc(id).get();
  if (!snap.exists) return null;
  return { ...(snap.data() as CrmMailboxMessage), id: snap.id };
}

export async function markMailboxMessageSeen(id: string): Promise<void> {
  const message = await getMailboxMessage(id);
  if (!message || message.seen) return;

  await adminDb().collection(MAILBOX_COLLECTION).doc(id).set(
    { seen: true, syncedAt: new Date().toISOString() },
    { merge: true }
  );

  const mailbox = getInfoMailbox();
  try {
    await withImapClient(mailbox, async (client) => {
      const lock = await client.getMailboxLock(message.imapFolder);
      try {
        await client.messageFlagsAdd({ uid: message.uid }, ["\\Seen"], { uid: true });
      } finally {
        lock.release();
      }
    });
  } catch (error) {
    console.warn("[Mailbox] mark seen on IMAP failed:", error);
  }
}

export async function moveMailboxMessage(input: {
  id: string;
  targetFolder: MailboxFolderKey;
}): Promise<CrmMailboxMessage> {
  const message = await getMailboxMessage(input.id);
  if (!message) throw new Error("Message not found.");
  if (message.folder === input.targetFolder) return message;

  const mailbox = getInfoMailbox();

  await withImapClient(mailbox, async (client) => {
    const folderMap = await resolveMailboxFolderMap(client);
    const targetPath = folderMap[input.targetFolder];
    const lock = await client.getMailboxLock(message.imapFolder);
    try {
      await client.messageMove({ uid: message.uid }, targetPath, { uid: true });
    } finally {
      lock.release();
    }
  });

  // Drop old doc; next sync will re-import under the new folder/uid.
  await adminDb().collection(MAILBOX_COLLECTION).doc(message.id).delete();
  return { ...message, folder: input.targetFolder };
}

export async function saveMailboxDraft(input: {
  to: string;
  subject: string;
  message: string;
}): Promise<{ saved: boolean; path?: string; error?: string }> {
  const mailbox = getInfoMailbox();
  const MailComposer = (await import("nodemailer/lib/mail-composer")).default;
  const from = mailbox.user;
  const composer = new MailComposer({
    from,
    to: input.to,
    subject: input.subject || "(no subject)",
    text: input.message || "",
  });
  const raw = await composer.compile().build();

  try {
    await withImapClient(mailbox, async (client) => {
      const folderMap = await resolveMailboxFolderMap(client);
      const path = folderMap.drafts;
      await client.append(path, raw, ["\\Draft", "\\Seen"]);
    });
    return { saved: true };
  } catch (error) {
    return {
      saved: false,
      error: error instanceof Error ? error.message : "Failed to save draft",
    };
  }
}

export function getConfiguredMailboxEmail(): string {
  return getInfoMailbox().user;
}
