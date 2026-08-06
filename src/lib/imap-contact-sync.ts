import { ImapFlow } from "imapflow";
import type { AddressBookSeed } from "@/lib/crm-address-book";
import {
  findExistingContact,
  getContactMatchKey,
  isSpamContact,
  mergeSeedIntoContact,
  stripUndefinedFields,
  type CrmAddressContact,
} from "@/lib/crm-address-book";
import { parseSignatureFields } from "@/lib/email-signature-parse";
import {
  imapHostFallbacks,
  ourMailboxEmails,
  readImapConnectionFromEnv,
  readImapMailboxesFromEnv,
  type ImapMailboxConfig,
} from "@/lib/imap-mailboxes";

const SYNC_STATE_COLLECTION = "crm_settings";
const SYNC_STATE_DOC = "email_inbox_sync";

/** Max bytes of body kept in memory for signature parse (then discarded). */
const BODY_SNIPPET_MAX_BYTES = 48_000;

export type EmailSenderContact = {
  email: string;
  fullName: string;
  company?: string;
  phone?: string;
};

export type MailboxSyncResult = {
  mailboxId: string;
  mailbox: string;
  messagesScanned: number;
  uniqueSenders: number;
  signaturesParsed: number;
  lastUid: number;
  error?: string;
};

export type EmailContactSyncResult = {
  mode: "full" | "incremental";
  mailboxes: MailboxSyncResult[];
  created: number;
  updated: number;
  skipped: number;
  sendersFound: number;
};

type SyncStateDoc = {
  mailboxes?: Record<
    string,
    {
      lastUid?: number;
      lastSyncedAt?: unknown;
      messagesScanned?: number;
    }
  >;
};

type SenderAccumulator = EmailSenderContact & {
  sampleUid: number;
};

function isNoiseEmail(email: string): boolean {
  const local = email.split("@")[0] || "";
  return /^(noreply|no-reply|donotreply|do-not-reply|mailer-daemon|postmaster|bounce|notifications?|alert|daemon)/i.test(
    local
  );
}

/** Parse "Name" <email@x.com> style address objects from IMAP envelope. */
export function parseEnvelopeAddress(addr: {
  name?: string | null;
  address?: string | null;
  mailbox?: string | null;
  host?: string | null;
} | null | undefined): EmailSenderContact | null {
  if (!addr) return null;

  const email =
    (addr.address || "").trim().toLowerCase() ||
    ([addr.mailbox, addr.host].filter(Boolean).join("@").toLowerCase() || "");
  if (!email || !email.includes("@")) return null;
  if (isNoiseEmail(email)) return null;

  const ours = ourMailboxEmails();
  if (ours.has(email)) return null;

  const rawName = String(addr.name || "").trim();
  let fullName = rawName;
  let company: string | undefined;

  // Common patterns: "John Smith via Acme" or "John Smith (Acme)"
  const viaMatch = rawName.match(/^(.+?)\s+via\s+(.+)$/i);
  if (viaMatch) {
    fullName = viaMatch[1].trim();
    company = viaMatch[2].trim() || undefined;
  } else {
    const parenMatch = rawName.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
    if (parenMatch) {
      fullName = parenMatch[1].trim();
      company = parenMatch[2].trim() || undefined;
    }
  }

  if (!fullName) {
    const local = email.split("@")[0] || "";
    fullName = local
      .replace(/[._+-]+/g, " ")
      .replace(/\d+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    fullName = fullName
      ? fullName.replace(/\b\w/g, (c) => c.toUpperCase())
      : email;
  }

  return { email, fullName, company };
}

function mergeSender(
  prev: SenderAccumulator | undefined,
  next: EmailSenderContact,
  uid: number
): SenderAccumulator {
  if (!prev) {
    return { ...next, sampleUid: uid };
  }
  const merged: SenderAccumulator = { ...prev };
  if (
    next.fullName &&
    next.fullName.includes(" ") &&
    (!prev.fullName || !prev.fullName.includes(" "))
  ) {
    merged.fullName = next.fullName;
  }
  if (next.company && !prev.company) merged.company = next.company;
  if (next.phone && !prev.phone) merged.phone = next.phone;
  // Prefer a newer message as signature sample when fields are still incomplete.
  if ((!merged.phone || !merged.company) && uid >= prev.sampleUid) {
    merged.sampleUid = uid;
  }
  return merged;
}

function seedFromSender(sender: EmailSenderContact): AddressBookSeed {
  return {
    fullName: sender.fullName,
    email: sender.email,
    company: sender.company,
    phone: sender.phone,
    notes: "Synced from email inbox (sender + signature fields)",
    source: "email",
  };
}

async function readStreamLimited(
  stream: NodeJS.ReadableStream,
  maxBytes: number
): Promise<string> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of stream) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    const remaining = maxBytes - total;
    if (remaining <= 0) break;
    chunks.push(buf.length > remaining ? buf.subarray(0, remaining) : buf);
    total += Math.min(buf.length, remaining);
    if (total >= maxBytes) break;
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** Find a text/plain or text/html part path from bodyStructure (best-effort). */
function findTextPartPath(structure: unknown): string | undefined {
  if (!structure || typeof structure !== "object") return undefined;

  let plainPath: string | undefined;
  let htmlPath: string | undefined;

  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const n = node as { type?: string; part?: string; childNodes?: unknown[] };
    const type = String(n.type || "").toLowerCase();
    if (type === "text/plain") {
      plainPath = plainPath || n.part || "TEXT";
    } else if (type === "text/html") {
      htmlPath = htmlPath || n.part || "TEXT";
    }
    for (const child of n.childNodes || []) walk(child);
  };

  walk(structure);
  return plainPath || htmlPath;
}

async function enrichSenderFromSignature(
  client: ImapFlow,
  sender: SenderAccumulator
): Promise<SenderAccumulator> {
  if (sender.phone && sender.company) return sender;

  try {
    const structureMsg = await client.fetchOne(
      sender.sampleUid,
      { bodyStructure: true, uid: true },
      { uid: true }
    );
    const partPath = findTextPartPath(structureMsg?.bodyStructure);

    const downloaded = await client.download(sender.sampleUid, partPath, {
      uid: true,
      maxBytes: BODY_SNIPPET_MAX_BYTES,
    });
    if (!downloaded?.content) return sender;

    const raw = await readStreamLimited(downloaded.content, BODY_SNIPPET_MAX_BYTES);
    // Discard raw after parse — only phone/company leave this function.
    const fields = parseSignatureFields(raw, sender.email);
    return {
      ...sender,
      phone: sender.phone || fields.phone,
      company: sender.company || fields.company,
    };
  } catch (error) {
    console.warn(
      `[IMAP] Signature parse skipped for ${sender.email}:`,
      error instanceof Error ? error.message : error
    );
    return sender;
  }
}

async function fetchSendersFromMailbox(
  mailbox: ImapMailboxConfig,
  options: { sinceUidExclusive: number }
): Promise<{
  senders: Map<string, EmailSenderContact>;
  lastUid: number;
  messagesScanned: number;
  signaturesParsed: number;
}> {
  const conn = readImapConnectionFromEnv();
  if (!conn) {
    throw new Error("IMAP host is not configured.");
  }

  const hosts = imapHostFallbacks(mailbox.host || conn.host);
  let lastError: unknown;

  for (const host of hosts) {
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
        minVersion: "TLSv1.2",
      },
    });

    try {
      await client.connect();
      const lock = await client.getMailboxLock("INBOX");
      try {
        const status = client.mailbox;
        const exists = status && typeof status === "object" ? Number(status.exists || 0) : 0;
        if (!exists) {
          return {
            senders: new Map(),
            lastUid: options.sinceUidExclusive,
            messagesScanned: 0,
            signaturesParsed: 0,
          };
        }

        const senders = new Map<string, SenderAccumulator>();
        let lastUid = options.sinceUidExclusive;
        let messagesScanned = 0;

        const searchQuery =
          options.sinceUidExclusive > 0
            ? { uid: `${options.sinceUidExclusive + 1}:*` }
            : { all: true as const };

        const uids = await client.search(searchQuery, { uid: true });
        if (!uids || (Array.isArray(uids) && uids.length === 0)) {
          return { senders: new Map(), lastUid, messagesScanned: 0, signaturesParsed: 0 };
        }

        // Pass 1: envelopes only (fast).
        for await (const msg of client.fetch(uids, { envelope: true, uid: true }, { uid: true })) {
          messagesScanned += 1;
          if (typeof msg.uid === "number" && msg.uid > lastUid) {
            lastUid = msg.uid;
          }

          const fromList = msg.envelope?.from || [];
          for (const addr of fromList) {
            const parsed = parseEnvelopeAddress(addr);
            if (!parsed || typeof msg.uid !== "number") continue;
            const prev = senders.get(parsed.email);
            senders.set(parsed.email, mergeSender(prev, parsed, msg.uid));
          }
        }

        // Pass 2: one body snippet per unique sender (for phone/company), then discard.
        let signaturesParsed = 0;
        for (const [email, sender] of senders) {
          if (sender.phone && sender.company) continue;
          const enriched = await enrichSenderFromSignature(client, sender);
          if (enriched.phone !== sender.phone || enriched.company !== sender.company) {
            signaturesParsed += 1;
          }
          senders.set(email, enriched);
        }

        const out = new Map<string, EmailSenderContact>();
        for (const [email, s] of senders) {
          out.set(email, {
            email: s.email,
            fullName: s.fullName,
            company: s.company,
            phone: s.phone,
          });
        }

        return { senders: out, lastUid, messagesScanned, signaturesParsed };
      } finally {
        lock.release();
      }
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (/authentication failed|invalid login|LOGIN failed/i.test(message) && host !== hosts.at(-1)) {
        console.warn(`[IMAP] Auth failed on ${host} for ${mailbox.user}, trying fallback…`);
        continue;
      }
      throw error;
    } finally {
      try {
        await client.logout();
      } catch {
        // ignore
      }
    }
  }

  throw lastError ?? new Error(`Failed to connect IMAP for ${mailbox.user}`);
}

type AdminDb = {
  collection: (path: string) => {
    get: () => Promise<{ docs: Array<{ id: string; data: () => Record<string, unknown> }> }>;
    add: (data: Record<string, unknown>) => Promise<{ id: string }>;
    doc: (id: string) => {
      get: () => Promise<{ exists: boolean; data: () => Record<string, unknown> | undefined }>;
      update: (data: Record<string, unknown>) => Promise<unknown>;
      set: (data: Record<string, unknown>, opts?: { merge?: boolean }) => Promise<unknown>;
    };
  };
};

type AdminFieldValue = {
  serverTimestamp: () => unknown;
};

async function loadExistingContacts(db: AdminDb): Promise<CrmAddressContact[]> {
  const snap = await db.collection("crm_contacts").get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CrmAddressContact, "id">) }));
}

async function upsertSenders(
  db: AdminDb,
  FieldValue: AdminFieldValue,
  senders: EmailSenderContact[],
  uid: string
): Promise<{ created: number; updated: number; skipped: number }> {
  const working = await loadExistingContacts(db);
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const sender of senders) {
    const seed = seedFromSender(sender);
    if (!seed.email) {
      skipped += 1;
      continue;
    }

    const existing = findExistingContact(working, seed);
    if (isSpamContact(existing)) {
      skipped += 1;
      continue;
    }

    const merged = stripUndefinedFields(
      mergeSeedIntoContact(existing, seed) as Record<string, unknown>
    ) as Omit<CrmAddressContact, "id">;

    if (existing) {
      const { createdBy: _cb, createdAt: _ca, updatedAt: _ua, ...updatePayload } = merged;
      await db.collection("crm_contacts").doc(existing.id).update({
        ...stripUndefinedFields(updatePayload as Record<string, unknown>),
        updatedAt: FieldValue.serverTimestamp(),
      });
      const idx = working.findIndex((c) => c.id === existing.id);
      if (idx >= 0) working[idx] = { ...existing, ...merged };
      updated += 1;
    } else {
      const ref = await db.collection("crm_contacts").add({
        ...merged,
        matchKey: getContactMatchKey(merged),
        createdBy: uid || "",
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      working.push({ id: ref.id, ...merged });
      created += 1;
    }
  }

  return { created, updated, skipped };
}

function mergeAcrossMailboxes(
  all: Map<string, EmailSenderContact>,
  incoming: Map<string, EmailSenderContact>
) {
  for (const [email, sender] of incoming) {
    const prev = all.get(email);
    if (!prev) {
      all.set(email, sender);
      continue;
    }
    all.set(email, {
      email,
      fullName:
        sender.fullName && sender.fullName.includes(" ") && !prev.fullName.includes(" ")
          ? sender.fullName
          : prev.fullName || sender.fullName,
      company: prev.company || sender.company,
      phone: prev.phone || sender.phone,
    });
  }
}

export async function syncEmailContacts(options: {
  db: AdminDb;
  FieldValue: AdminFieldValue;
  uid: string;
  mode?: "full" | "incremental";
}): Promise<EmailContactSyncResult> {
  const mailboxes = readImapMailboxesFromEnv();
  if (mailboxes.length === 0) {
    throw new Error(
      "No IMAP mailboxes configured. Set IMAP_PASSWORD_INFO (or SMTP_PASSWORD) and IMAP_PASSWORD_ARSHAD."
    );
  }

  const stateRef = options.db.collection(SYNC_STATE_COLLECTION).doc(SYNC_STATE_DOC);
  const stateSnap = await stateRef.get();
  const state = (stateSnap.exists ? stateSnap.data() : {}) as SyncStateDoc;
  const mailboxState = state.mailboxes || {};

  const hasAnyCursor = mailboxes.some((mb) => Number(mailboxState[mb.id]?.lastUid || 0) > 0);
  const mode: "full" | "incremental" =
    options.mode || (hasAnyCursor ? "incremental" : "full");

  const allSenders = new Map<string, EmailSenderContact>();
  const mailboxResults: MailboxSyncResult[] = [];
  const nextState: SyncStateDoc["mailboxes"] = { ...mailboxState };

  for (const mailbox of mailboxes) {
    const prevUid = mode === "full" ? 0 : Number(mailboxState[mailbox.id]?.lastUid || 0);
    try {
      const { senders, lastUid, messagesScanned, signaturesParsed } = await fetchSendersFromMailbox(
        mailbox,
        { sinceUidExclusive: prevUid }
      );

      mergeAcrossMailboxes(allSenders, senders);

      nextState[mailbox.id] = {
        lastUid: Math.max(prevUid, lastUid),
        lastSyncedAt: options.FieldValue.serverTimestamp(),
        messagesScanned,
      };

      mailboxResults.push({
        mailboxId: mailbox.id,
        mailbox: mailbox.user,
        messagesScanned,
        uniqueSenders: senders.size,
        signaturesParsed,
        lastUid: Math.max(prevUid, lastUid),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[IMAP] Sync failed for ${mailbox.user}:`, message);
      mailboxResults.push({
        mailboxId: mailbox.id,
        mailbox: mailbox.user,
        messagesScanned: 0,
        uniqueSenders: 0,
        signaturesParsed: 0,
        lastUid: prevUid,
        error: message,
      });
    }
  }

  const { created, updated, skipped } = await upsertSenders(
    options.db,
    options.FieldValue,
    [...allSenders.values()],
    options.uid
  );

  await stateRef.set(
    {
      mailboxes: nextState,
      updatedAt: options.FieldValue.serverTimestamp(),
      lastMode: mode,
      lastRunBy: options.uid,
    },
    { merge: true }
  );

  const failedAll = mailboxResults.every((r) => r.error) && mailboxes.length > 0;
  if (failedAll) {
    throw new Error(
      mailboxResults.map((r) => `${r.mailbox}: ${r.error}`).join(" | ") ||
        "IMAP sync failed for all mailboxes."
    );
  }

  return {
    mode,
    mailboxes: mailboxResults,
    created,
    updated,
    skipped,
    sendersFound: allSenders.size,
  };
}
