import { adminDb } from "@/lib/firebase-admin";
import {
  LEXI_MESSAGES_COLLECTION,
  type LexiMessage,
  type LexiMessageType,
} from "@/lib/lexi/types";

export async function createLexiMessage(input: {
  type: LexiMessageType;
  title: string;
  body: string;
  href?: string | null;
  meta?: Record<string, unknown>;
}): Promise<LexiMessage> {
  const ref = adminDb().collection(LEXI_MESSAGES_COLLECTION).doc();
  const now = new Date();
  const doc: LexiMessage = {
    id: ref.id,
    type: input.type,
    title: String(input.title || "Lexi update").slice(0, 200),
    body: String(input.body || "").slice(0, 4000),
    read: false,
    readAt: null,
    createdAt: now.toISOString(),
    createdAtMs: now.getTime(),
    href: input.href || null,
    meta: input.meta || {},
  };
  const payload: Record<string, unknown> = { ...doc };
  for (const key of Object.keys(payload)) {
    if (payload[key] === undefined) delete payload[key];
  }
  await ref.set(payload);
  return doc;
}

export async function listLexiMessages(input?: {
  limit?: number;
  unreadOnly?: boolean;
}): Promise<LexiMessage[]> {
  const limit = Math.min(Math.max(input?.limit || 40, 1), 100);
  const snap = await adminDb().collection(LEXI_MESSAGES_COLLECTION).limit(200).get();
  let rows = snap.docs.map((d) => ({ ...(d.data() as LexiMessage), id: d.id }));
  if (input?.unreadOnly) {
    rows = rows.filter((m) => !m.read);
  }
  rows.sort((a, b) => Number(b.createdAtMs || 0) - Number(a.createdAtMs || 0));
  return rows.slice(0, limit);
}

export async function markLexiMessageRead(
  id: string,
  read = true
): Promise<LexiMessage | null> {
  const ref = adminDb().collection(LEXI_MESSAGES_COLLECTION).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const patch = {
    read,
    readAt: read ? new Date().toISOString() : null,
  };
  await ref.set(patch, { merge: true });
  return { ...(snap.data() as LexiMessage), id: snap.id, ...patch };
}

export async function markAllLexiMessagesRead(): Promise<number> {
  const unread = await listLexiMessages({ limit: 100, unreadOnly: true });
  let n = 0;
  for (const msg of unread) {
    await markLexiMessageRead(msg.id, true);
    n += 1;
  }
  return n;
}

export async function getLexiUnreadCount(): Promise<number> {
  const unread = await listLexiMessages({ limit: 100, unreadOnly: true });
  return unread.length;
}
