import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

/** Top-level collection: per-client CRM invoice templates (terms, company, FOB meta). */
export const CRM_CLIENT_INVOICE_TEMPLATES = "crmClientInvoiceTemplates";

export type CrmClientInvoiceTemplateFields = {
  companyName: string;
  companyAddress: string;
  companyCityStateZip: string;
  companyCountry: string;
  companyPhone: string;
  companyEmail: string;
  invoiceNote: string;
  fobPoint: string;
  shippingTerms: string;
  shippedVia: string;
  terms: string;
};

export type CrmClientInvoiceTemplate = CrmClientInvoiceTemplateFields & {
  id: string;
  clientEmail: string;
  clientName: string;
  prepcorexClientUserId?: string | null;
  createdAt?: unknown;
  updatedAt?: unknown;
  updatedBy?: string | null;
};

export function normalizeClientEmail(email?: string | null): string {
  return String(email || "").trim().toLowerCase();
}

export function clientInvoiceTemplateDocId(input: {
  email?: string | null;
  prepcorexClientUserId?: string | null;
}): string {
  const email = normalizeClientEmail(input.email);
  if (email) {
    return `email_${email.replace(/[^a-z0-9]+/g, "_")}`;
  }
  const uid = String(input.prepcorexClientUserId || "").trim();
  if (uid) return `uid_${uid}`;
  throw new Error("Client email or PrepCorex user id is required to save a template.");
}

function mapTemplate(
  id: string,
  data: Record<string, unknown>
): CrmClientInvoiceTemplate {
  return {
    id,
    clientEmail: normalizeClientEmail(data.clientEmail as string),
    clientName: String(data.clientName || "").trim(),
    prepcorexClientUserId: data.prepcorexClientUserId
      ? String(data.prepcorexClientUserId).trim()
      : null,
    companyName: String(data.companyName || "").trim(),
    companyAddress: String(data.companyAddress || "").trim(),
    companyCityStateZip: String(data.companyCityStateZip || "").trim(),
    companyCountry: String(data.companyCountry || "").trim(),
    companyPhone: String(data.companyPhone || "").trim(),
    companyEmail: String(data.companyEmail || "").trim(),
    invoiceNote: String(data.invoiceNote || "").trim(),
    fobPoint: String(data.fobPoint || "").trim(),
    shippingTerms: String(data.shippingTerms || "").trim(),
    shippedVia: String(data.shippedVia || "").trim(),
    terms: String(data.terms || "").trim(),
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    updatedBy: data.updatedBy ? String(data.updatedBy) : null,
  };
}

export async function getClientInvoiceTemplate(input: {
  email?: string | null;
  prepcorexClientUserId?: string | null;
}): Promise<CrmClientInvoiceTemplate | null> {
  const email = normalizeClientEmail(input.email);
  const uid = String(input.prepcorexClientUserId || "").trim();

  if (email) {
    try {
      const byEmail = await getDoc(
        doc(db, CRM_CLIENT_INVOICE_TEMPLATES, clientInvoiceTemplateDocId({ email }))
      );
      if (byEmail.exists()) {
        return mapTemplate(byEmail.id, byEmail.data() as Record<string, unknown>);
      }
    } catch {
      /* continue */
    }
  }

  if (uid) {
    try {
      const byUid = await getDoc(
        doc(db, CRM_CLIENT_INVOICE_TEMPLATES, clientInvoiceTemplateDocId({ prepcorexClientUserId: uid }))
      );
      if (byUid.exists()) {
        return mapTemplate(byUid.id, byUid.data() as Record<string, unknown>);
      }
    } catch {
      /* continue */
    }
  }

  return null;
}

export async function listClientInvoiceTemplates(): Promise<CrmClientInvoiceTemplate[]> {
  try {
    const snap = await getDocs(
      query(collection(db, CRM_CLIENT_INVOICE_TEMPLATES), orderBy("updatedAt", "desc"))
    );
    return snap.docs.map((d) => mapTemplate(d.id, d.data() as Record<string, unknown>));
  } catch {
    const snap = await getDocs(collection(db, CRM_CLIENT_INVOICE_TEMPLATES));
    return snap.docs
      .map((d) => mapTemplate(d.id, d.data() as Record<string, unknown>))
      .sort((a, b) => (a.clientName || a.clientEmail).localeCompare(b.clientName || b.clientEmail));
  }
}

export async function saveClientInvoiceTemplate(input: {
  clientEmail: string;
  clientName?: string;
  prepcorexClientUserId?: string | null;
  fields: CrmClientInvoiceTemplateFields;
  updatedBy?: string | null;
}): Promise<CrmClientInvoiceTemplate> {
  const email = normalizeClientEmail(input.clientEmail);
  if (!email) throw new Error("Client email is required to save a template.");

  const id = clientInvoiceTemplateDocId({ email });
  const ref = doc(db, CRM_CLIENT_INVOICE_TEMPLATES, id);
  const existing = await getDoc(ref);
  const uid = input.prepcorexClientUserId
    ? String(input.prepcorexClientUserId).trim()
    : "";
  const payload = {
    clientEmail: email,
    clientName: String(input.clientName || "").trim(),
    prepcorexClientUserId: uid || null,
    ...input.fields,
    updatedAt: serverTimestamp(),
    updatedBy: input.updatedBy || null,
    ...(existing.exists() ? {} : { createdAt: serverTimestamp() }),
  };
  await setDoc(ref, payload, { merge: true });
  // Mirror under uid key so PrepCorex sync (sourceUserId) can resolve without email.
  if (uid) {
    const uidRef = doc(
      db,
      CRM_CLIENT_INVOICE_TEMPLATES,
      clientInvoiceTemplateDocId({ prepcorexClientUserId: uid })
    );
    await setDoc(uidRef, { ...payload, canonicalId: id }, { merge: true });
  }
  const saved = await getDoc(ref);
  return mapTemplate(id, (saved.data() || payload) as Record<string, unknown>);
}

export async function deleteClientInvoiceTemplate(id: string): Promise<void> {
  await deleteDoc(doc(db, CRM_CLIENT_INVOICE_TEMPLATES, id));
}

/** Patch CRM invoice form fields from a saved client template (does not touch line items). */
export function templateFieldsToInvoicePatch(
  template: CrmClientInvoiceTemplate
): CrmClientInvoiceTemplateFields & {
  clientName?: string;
  clientEmail?: string;
  prepcorexClientUserId?: string | null;
} {
  return {
    companyName: template.companyName,
    companyAddress: template.companyAddress,
    companyCityStateZip: template.companyCityStateZip,
    companyCountry: template.companyCountry,
    companyPhone: template.companyPhone,
    companyEmail: template.companyEmail,
    invoiceNote: template.invoiceNote,
    fobPoint: template.fobPoint,
    shippingTerms: template.shippingTerms,
    shippedVia: template.shippedVia,
    terms: template.terms,
    ...(template.clientName ? { clientName: template.clientName } : {}),
    ...(template.clientEmail ? { clientEmail: template.clientEmail } : {}),
    ...(template.prepcorexClientUserId
      ? { prepcorexClientUserId: template.prepcorexClientUserId }
      : {}),
  };
}
