export type CrmContactSource = "manual" | "lead" | "quote" | "invoice";

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
  createdBy?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type AddressBookSeed = Partial<Omit<CrmAddressContact, "id" | "matchKey">> & {
  fullName?: string;
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

export function mergeSeedIntoContact(
  existing: CrmAddressContact | null,
  seed: AddressBookSeed
): Omit<CrmAddressContact, "id"> {
  const current = existing ?? ({
    fullName: "",
    matchKey: "",
  } as CrmAddressContact);

  const merged: Omit<CrmAddressContact, "id"> = {
    fullName: norm(seed.fullName) || norm(current.fullName),
    company: norm(seed.company) || norm(current.company),
    email: norm(seed.email) || norm(current.email),
    phone: norm(seed.phone) || norm(current.phone),
    address: norm(seed.address) || norm(current.address),
    city: norm(seed.city) || norm(current.city),
    state: norm(seed.state) || norm(current.state),
    zip: norm(seed.zip) || norm(current.zip),
    country: norm(seed.country) || norm(current.country),
    notes: norm(seed.notes) || norm(current.notes),
    source: seed.source || current.source || "manual",
    createdBy: current.createdBy,
    createdAt: current.createdAt,
    updatedAt: current.updatedAt,
    matchKey: getContactMatchKey({
      fullName: norm(seed.fullName) || norm(current.fullName),
      company: norm(seed.company) || norm(current.company),
      email: norm(seed.email) || norm(current.email),
      phone: norm(seed.phone) || norm(current.phone),
    }),
  };

  return merged;
}
