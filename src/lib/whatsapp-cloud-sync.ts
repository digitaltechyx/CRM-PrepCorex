import { createHmac, timingSafeEqual } from "crypto";
import {
  getContactMatchKey,
  isSpamContact,
  mergeSeedIntoContact,
  normalizeWhatsAppId,
  stripUndefinedFields,
  type AddressBookSeed,
  type CrmAddressContact,
} from "@/lib/crm-address-book";

export type WhatsAppCloudConfig = {
  verifyToken: string;
  appSecret?: string;
  accessToken?: string;
  phoneNumberId?: string;
};

export type WhatsAppInboundContact = {
  whatsappId: string;
  fullName: string;
  phone?: string;
};

export type WhatsAppWebhookProcessResult = {
  contactsSeen: number;
  created: number;
  updated: number;
  skipped: number;
};

type AdminDb = {
  collection: (path: string) => {
    where: (
      field: string,
      op: string,
      value: unknown
    ) => {
      limit: (n: number) => {
        get: () => Promise<{
          empty: boolean;
          docs: Array<{ id: string; data: () => Record<string, unknown> }>;
        }>;
      };
    };
    add: (data: Record<string, unknown>) => Promise<{ id: string }>;
    doc: (id: string) => {
      update: (data: Record<string, unknown>) => Promise<unknown>;
    };
  };
};

type AdminFieldValue = {
  serverTimestamp: () => unknown;
};

type WaContactNode = {
  wa_id?: string;
  profile?: { name?: string };
};

type WaChangeValue = {
  contacts?: WaContactNode[];
  messages?: Array<{ from?: string }>;
};

type WaWebhookBody = {
  object?: string;
  entry?: Array<{
    changes?: Array<{
      field?: string;
      value?: WaChangeValue;
    }>;
  }>;
};

export function readWhatsAppCloudConfigFromEnv(): WhatsAppCloudConfig | null {
  const verifyToken = String(process.env.WHATSAPP_VERIFY_TOKEN || "").trim();
  if (!verifyToken) return null;
  return {
    verifyToken,
    appSecret: String(process.env.WHATSAPP_APP_SECRET || "").trim() || undefined,
    accessToken: String(process.env.WHATSAPP_ACCESS_TOKEN || "").trim() || undefined,
    phoneNumberId: String(process.env.WHATSAPP_PHONE_NUMBER_ID || "").trim() || undefined,
  };
}

export function isWhatsAppWebhookConfigured(): boolean {
  return Boolean(readWhatsAppCloudConfigFromEnv()?.verifyToken);
}

/** Verify Meta X-Hub-Signature-256. If app secret is unset, skip (dev only). */
export function verifyWhatsAppSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret?: string
): boolean {
  if (!appSecret) return true;
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) return false;
  const expected =
    "sha256=" + createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  try {
    const a = Buffer.from(signatureHeader);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function extractWhatsAppContactsFromWebhook(
  body: WaWebhookBody
): WhatsAppInboundContact[] {
  const byId = new Map<string, WhatsAppInboundContact>();
  if (body.object !== "whatsapp_business_account") return [];

  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field && change.field !== "messages") continue;
      const value = change.value;
      if (!value) continue;

      for (const c of value.contacts || []) {
        const whatsappId = normalizeWhatsAppId(c.wa_id);
        if (!whatsappId) continue;
        const fullName =
          String(c.profile?.name || "").trim() || `WhatsApp ${whatsappId.slice(-6)}`;
        byId.set(whatsappId, {
          whatsappId,
          fullName,
          phone: `+${whatsappId}`,
        });
      }

      // Fallback: message.from when contacts array is missing
      for (const m of value.messages || []) {
        const whatsappId = normalizeWhatsAppId(m.from);
        if (!whatsappId || byId.has(whatsappId)) continue;
        byId.set(whatsappId, {
          whatsappId,
          fullName: `WhatsApp ${whatsappId.slice(-6)}`,
          phone: `+${whatsappId}`,
        });
      }
    }
  }

  return [...byId.values()];
}

function seedFromWhatsApp(contact: WhatsAppInboundContact): AddressBookSeed {
  return {
    fullName: contact.fullName,
    phone: contact.phone || `+${contact.whatsappId}`,
    whatsappId: contact.whatsappId,
    source: "whatsapp",
  };
}

async function findContactDoc(
  db: AdminDb,
  contact: WhatsAppInboundContact
): Promise<CrmAddressContact | null> {
  const waId = contact.whatsappId;

  const byWa = await db.collection("crm_contacts").where("whatsappId", "==", waId).limit(1).get();
  if (!byWa.empty) {
    const d = byWa.docs[0];
    return { id: d.id, ...(d.data() as Omit<CrmAddressContact, "id">) };
  }

  const matchKey = getContactMatchKey({ whatsappId: waId, source: "whatsapp" });
  const byKey = await db.collection("crm_contacts").where("matchKey", "==", matchKey).limit(1).get();
  if (!byKey.empty) {
    const d = byKey.docs[0];
    return { id: d.id, ...(d.data() as Omit<CrmAddressContact, "id">) };
  }

  // Match existing phone-only contacts (avoid duplicate when same number already in book)
  const phonePlus = `+${waId}`;
  const byPhone = await db.collection("crm_contacts").where("phone", "==", phonePlus).limit(1).get();
  if (!byPhone.empty) {
    const d = byPhone.docs[0];
    return { id: d.id, ...(d.data() as Omit<CrmAddressContact, "id">) };
  }

  const byPhoneRaw = await db.collection("crm_contacts").where("phone", "==", waId).limit(1).get();
  if (!byPhoneRaw.empty) {
    const d = byPhoneRaw.docs[0];
    return { id: d.id, ...(d.data() as Omit<CrmAddressContact, "id">) };
  }

  return null;
}

export async function upsertWhatsAppContacts(
  db: AdminDb,
  FieldValue: AdminFieldValue,
  contacts: WhatsAppInboundContact[],
  createdBy = "whatsapp-webhook"
): Promise<WhatsAppWebhookProcessResult> {
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const contact of contacts) {
    if (!contact.whatsappId) {
      skipped += 1;
      continue;
    }

    const seed = seedFromWhatsApp(contact);
    const existing = await findContactDoc(db, contact);
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
      updated += 1;
    } else {
      await db.collection("crm_contacts").add({
        ...merged,
        matchKey: getContactMatchKey(merged),
        createdBy,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      created += 1;
    }
  }

  return {
    contactsSeen: contacts.length,
    created,
    updated,
    skipped,
  };
}

export async function processWhatsAppWebhookPayload(
  db: AdminDb,
  FieldValue: AdminFieldValue,
  body: WaWebhookBody
): Promise<WhatsAppWebhookProcessResult> {
  const contacts = extractWhatsAppContactsFromWebhook(body);
  if (contacts.length === 0) {
    return { contactsSeen: 0, created: 0, updated: 0, skipped: 0 };
  }
  return upsertWhatsAppContacts(db, FieldValue, contacts);
}

/** Optional: verify token can call Graph phone-number endpoint. */
export async function pingWhatsAppCloudApi(config: WhatsAppCloudConfig): Promise<{
  ok: boolean;
  error?: string;
  displayPhoneNumber?: string;
  verifiedName?: string;
}> {
  if (!config.accessToken || !config.phoneNumberId) {
    return {
      ok: false,
      error: "Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID to test the API.",
    };
  }
  const url =
    `https://graph.facebook.com/v21.0/${encodeURIComponent(config.phoneNumberId)}` +
    `?fields=display_phone_number,verified_name&access_token=${encodeURIComponent(config.accessToken)}`;
  const res = await fetch(url, { method: "GET", cache: "no-store" });
  const json = (await res.json()) as {
    display_phone_number?: string;
    verified_name?: string;
    error?: { message?: string };
  };
  if (!res.ok || json.error) {
    return { ok: false, error: json.error?.message || `Graph HTTP ${res.status}` };
  }
  return {
    ok: true,
    displayPhoneNumber: json.display_phone_number,
    verifiedName: json.verified_name,
  };
}
