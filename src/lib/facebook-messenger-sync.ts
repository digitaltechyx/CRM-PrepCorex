import type { AddressBookSeed } from "@/lib/crm-address-book";
import {
  findExistingContact,
  getContactMatchKey,
  isSpamContact,
  mergeSeedIntoContact,
  stripUndefinedFields,
  type CrmAddressContact,
} from "@/lib/crm-address-book";

const GRAPH_VERSION_DEFAULT = "v21.0";
const PAGE_SIZE = 50;

export type FacebookMessengerContact = {
  facebookMessengerId: string;
  fullName: string;
  email?: string;
  phone?: string;
};

export type FacebookContactSyncResult = {
  configured: boolean;
  pageId?: string;
  conversationsScanned: number;
  contactsFound: number;
  created: number;
  updated: number;
  skipped: number;
};

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

type GraphParticipant = {
  id?: string;
  name?: string;
  email?: string;
};

type GraphConversation = {
  id?: string;
  participants?: { data?: GraphParticipant[] };
};

type GraphConversationsResponse = {
  data?: GraphConversation[];
  paging?: { next?: string; cursors?: { after?: string } };
  error?: { message?: string; type?: string; code?: number };
};

export function readFacebookPageConfigFromEnv(): {
  pageId: string;
  accessToken: string;
  apiVersion: string;
} | null {
  const pageId = String(process.env.FACEBOOK_PAGE_ID || "").trim();
  const accessToken = String(process.env.FACEBOOK_PAGE_ACCESS_TOKEN || "").trim();
  if (!pageId || !accessToken) return null;
  const apiVersion =
    String(process.env.FACEBOOK_GRAPH_API_VERSION || GRAPH_VERSION_DEFAULT).trim() ||
    GRAPH_VERSION_DEFAULT;
  return { pageId, accessToken, apiVersion };
}

/** Graph often returns PSID@facebook.com — never treat that as a real email. */
export function isSyntheticFacebookEmail(email: string): boolean {
  const e = email.trim().toLowerCase();
  return e.endsWith("@facebook.com") || e.endsWith("@messenger.com");
}

function seedFromMessengerContact(contact: FacebookMessengerContact): AddressBookSeed {
  return {
    fullName: contact.fullName,
    facebookMessengerId: contact.facebookMessengerId,
    email: contact.email,
    phone: contact.phone,
    source: "facebook",
  };
}

async function loadExistingContacts(db: AdminDb): Promise<CrmAddressContact[]> {
  const snap = await db.collection("crm_contacts").get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CrmAddressContact, "id">) }));
}

async function fetchConversationsPage(
  url: string
): Promise<GraphConversationsResponse> {
  const res = await fetch(url, { method: "GET", cache: "no-store" });
  const json = (await res.json()) as GraphConversationsResponse;
  if (!res.ok || json.error) {
    const msg = json.error?.message || `Graph API HTTP ${res.status}`;
    throw new Error(msg);
  }
  return json;
}

/**
 * People who messaged the Facebook Page (Messenger), keyed by Page-scoped ID.
 * Does not pull personal friends. Email/phone are usually unavailable from Graph.
 */
export async function fetchMessengerContactsFromPage(options: {
  pageId: string;
  accessToken: string;
  apiVersion?: string;
}): Promise<{ contacts: FacebookMessengerContact[]; conversationsScanned: number }> {
  const version = options.apiVersion || GRAPH_VERSION_DEFAULT;
  const token = encodeURIComponent(options.accessToken);
  const fields = encodeURIComponent("participants,updated_time");
  let url =
    `https://graph.facebook.com/${version}/${encodeURIComponent(options.pageId)}/conversations` +
    `?fields=${fields}&platform=MESSENGER&limit=${PAGE_SIZE}&access_token=${token}`;

  const byPsid = new Map<string, FacebookMessengerContact>();
  let conversationsScanned = 0;

  while (url) {
    const page = await fetchConversationsPage(url);
    const rows = page.data || [];
    conversationsScanned += rows.length;

    for (const conv of rows) {
      const participants = conv.participants?.data || [];
      for (const p of participants) {
        const id = String(p.id || "").trim();
        if (!id || id === options.pageId) continue;

        const name = String(p.name || "").trim();
        const fullName = name || `Messenger ${id.slice(-6)}`;
        const rawEmail = String(p.email || "").trim();
        const email =
          rawEmail && !isSyntheticFacebookEmail(rawEmail) ? rawEmail.toLowerCase() : undefined;
        const prev = byPsid.get(id);
        if (!prev || (name.includes(" ") && !prev.fullName.includes(" "))) {
          byPsid.set(id, {
            facebookMessengerId: id,
            fullName,
            email: email || prev?.email,
            phone: prev?.phone,
          });
        } else if (email && !prev.email) {
          byPsid.set(id, { ...prev, email });
        }
      }
    }

    url = page.paging?.next || "";
  }

  return { contacts: [...byPsid.values()], conversationsScanned };
}

async function upsertMessengerContacts(
  db: AdminDb,
  FieldValue: AdminFieldValue,
  contacts: FacebookMessengerContact[],
  uid: string
): Promise<{ created: number; updated: number; skipped: number }> {
  const working = await loadExistingContacts(db);
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const contact of contacts) {
    if (!contact.facebookMessengerId) {
      skipped += 1;
      continue;
    }

    const seed = seedFromMessengerContact(contact);
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

export async function syncFacebookMessengerContacts(options: {
  db: AdminDb;
  FieldValue: AdminFieldValue;
  uid: string;
}): Promise<FacebookContactSyncResult> {
  const config = readFacebookPageConfigFromEnv();
  if (!config) {
    return {
      configured: false,
      conversationsScanned: 0,
      contactsFound: 0,
      created: 0,
      updated: 0,
      skipped: 0,
    };
  }

  const { contacts, conversationsScanned } = await fetchMessengerContactsFromPage(config);
  const { created, updated, skipped } = await upsertMessengerContacts(
    options.db,
    options.FieldValue,
    contacts,
    options.uid
  );

  return {
    configured: true,
    pageId: config.pageId,
    conversationsScanned,
    contactsFound: contacts.length,
    created,
    updated,
    skipped,
  };
}
