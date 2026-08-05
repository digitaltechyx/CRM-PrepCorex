export type CrmContactSource = "manual" | "lead" | "quote" | "invoice" | "prepcorex" | "email";

export const CRM_CONTACT_SOURCE_LABELS: Record<CrmContactSource, string> = {
  manual: "Manual",
  lead: "Lead",
  quote: "Quotation",
  invoice: "Invoice",
  prepcorex: "PrepCorex",
  email: "Email",
};

export interface CrmAddressContact {
  id: string;
  fullName: string;
  company?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  notes?: string;
  matchKey: string;
  source?: CrmContactSource;
  /** PrepCorex StockFlow user uid when synced from users collection. */
  prepcorexUserId?: string;
  createdBy?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type AddressBookSeed = Partial<Omit<CrmAddressContact, "id" | "matchKey">> & {
  fullName?: string;
  prepcorexUserId?: string;
};

function norm(v?: string): string {
  return (v || "").trim();
}

function normLower(v?: string): string {
  return norm(v).toLowerCase();
}

function normPhone(v?: string): string {
  return (v || "").replace(/[^\d+]/g, "");
}

export function getContactMatchKey(seed: AddressBookSeed): string {
  const prepcorexUserId = norm(seed.prepcorexUserId);
  if (prepcorexUserId) return `prepcorex:${prepcorexUserId}`;
  const email = normLower(seed.email);
  if (email) return `email:${email}`;
  const phone = normPhone(seed.phone);
  if (phone) return `phone:${phone}`;
  const name = normLower(seed.fullName);
  const company = normLower(seed.company);
  return `name:${name}|company:${company}`;
}

export function toSearchBlob(contact: AddressBookSeed): string {
  return [
    contact.fullName,
    contact.company,
    contact.email,
    contact.phone,
    contact.address,
    contact.city,
    contact.state,
    contact.zip,
    contact.country,
    contact.source,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function contactMatchesQuery(contact: AddressBookSeed, queryText: string): boolean {
  const q = normLower(queryText);
  if (!q) return true;
  return toSearchBlob(contact).includes(q);
}

export function contactSuggestionLabel(contact: AddressBookSeed): string {
  const name = norm(contact.fullName) || "Unnamed";
  const company = norm(contact.company);
  const email = norm(contact.email);
  const phone = norm(contact.phone);
  const secondary = email || phone || company;
  return secondary ? `${name} • ${secondary}` : name;
}

export function contactSourceLabel(source?: string | null): string {
  const key = String(source || "manual").trim().toLowerCase() as CrmContactSource;
  return CRM_CONTACT_SOURCE_LABELS[key] || "Manual";
}

/**
 * Find an existing contact to update instead of creating a duplicate.
 * Prefer PrepCorex uid, then email, then matchKey.
 */
export function findExistingContact(
  contacts: CrmAddressContact[],
  seed: AddressBookSeed
): CrmAddressContact | null {
  const prepcorexUserId = norm(seed.prepcorexUserId);
  if (prepcorexUserId) {
    const byUid = contacts.find((c) => norm(c.prepcorexUserId) === prepcorexUserId);
    if (byUid) return byUid;
  }

  const email = normLower(seed.email);
  if (email) {
    const byEmail = contacts.find((c) => normLower(c.email) === email);
    if (byEmail) return byEmail;
  }

  const key = getContactMatchKey(seed);
  return contacts.find((c) => c.matchKey === key) ?? null;
}

export function mergeSeedIntoContact(
  existing: CrmAddressContact | null,
  seed: AddressBookSeed
): Omit<CrmAddressContact, "id"> {
  const current = existing ?? ({
    fullName: "",
    matchKey: "",
  } as CrmAddressContact);

  const fullName = norm(seed.fullName) || norm(current.fullName);
  const company = norm(seed.company) || norm(current.company);
  const email = norm(seed.email) || norm(current.email);
  const phone = norm(seed.phone) || norm(current.phone);
  const prepcorexUserId = norm(seed.prepcorexUserId) || norm(current.prepcorexUserId);

  const merged: Omit<CrmAddressContact, "id"> = {
    fullName,
    company: company || undefined,
    email: email || undefined,
    phone: phone || undefined,
    address: norm(seed.address) || norm(current.address) || undefined,
    city: norm(seed.city) || norm(current.city) || undefined,
    state: norm(seed.state) || norm(current.state) || undefined,
    zip: norm(seed.zip) || norm(current.zip) || undefined,
    country: norm(seed.country) || norm(current.country) || undefined,
    notes: norm(seed.notes) || norm(current.notes) || undefined,
    // Keep original source on update so we don't rewrite "Lead" → "PrepCorex" on merge.
    source: (existing?.source || seed.source || "manual") as CrmContactSource,
    prepcorexUserId: prepcorexUserId || undefined,
    matchKey: getContactMatchKey({
      fullName,
      company,
      email,
      phone,
      prepcorexUserId,
    }),
  };

  // Only copy createdBy/createdAt when present — Firestore rejects `undefined`.
  if (current.createdBy) merged.createdBy = current.createdBy;
  if (current.createdAt != null) merged.createdAt = current.createdAt;
  if (current.updatedAt != null) merged.updatedAt = current.updatedAt;

  return merged;
}

/** Remove undefined values so Firestore updateDoc/addDoc never see them. */
export function stripUndefinedFields<T extends Record<string, unknown>>(data: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) out[key] = value;
  }
  return out as T;
}

/** Map a PrepCorex `users/{uid}` doc into an address-book seed. */
export type PrepCorexUserMapResult =
  | { ok: true; seed: AddressBookSeed }
  | { ok: false; reason: "non_client" | "incomplete" };

/**
 * Clients (and commission agents) sync into the address book — including
 * approved, pending, locked, disabled, and deleted accounts.
 * Staff roles (admin / warehouse ops without a client role) are skipped.
 */
export function mapPrepCorexUser(
  uid: string,
  data: Record<string, unknown>
): PrepCorexUserMapResult {
  const roles = Array.isArray(data.roles)
    ? data.roles.map((r) => String(r || "").trim().toLowerCase())
    : [];
  const role = String(data.role || "").trim().toLowerCase();
  const isClient =
    role === "user" ||
    roles.includes("user") ||
    roles.includes("commission_agent");
  if (!isClient) return { ok: false, reason: "non_client" };

  const fullName =
    String(data.name || "").trim() ||
    String(data.companyName || "").trim() ||
    String(data.email || "").trim();
  if (!fullName) return { ok: false, reason: "incomplete" };

  const status = String(data.status || "approved").trim().toLowerCase() || "approved";
  const clientId = String(data.clientId || "").trim();
  const notesParts = [
    clientId ? `Client ID: ${clientId}` : "",
    `PrepCorex user`,
    status !== "approved" ? `Account status: ${status}` : "",
  ].filter(Boolean);

  return {
    ok: true,
    seed: {
      fullName,
      company: String(data.companyName || "").trim(),
      email: String(data.email || "").trim(),
      phone: String(data.phone || "").trim(),
      address: String(data.address || "").trim(),
      city: String(data.city || "").trim(),
      state: String(data.state || "").trim(),
      zip: String(data.zipCode || data.zip || "").trim(),
      country: String(data.country || "").trim(),
      notes: notesParts.join(" · "),
      source: "prepcorex",
      prepcorexUserId: uid,
    },
  };
}

/** @deprecated Use mapPrepCorexUser — kept for call sites that expect null. */
export function fromPrepCorexUser(
  uid: string,
  data: Record<string, unknown>
): AddressBookSeed | null {
  const result = mapPrepCorexUser(uid, data);
  return result.ok ? result.seed : null;
}
