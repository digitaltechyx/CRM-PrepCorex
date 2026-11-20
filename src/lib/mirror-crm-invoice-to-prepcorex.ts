import { addDoc, collection, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { format } from "date-fns";
import { db } from "@/lib/firebase";
import { parseCrmStyleInvoiceLine } from "@/lib/invoice-line-parse";
import { getClientInvoiceTemplate } from "@/lib/crm-client-invoice-template";

type CrmItem = {
  description?: string;
  quantity?: number;
  unitPrice?: number;
  amount?: number;
  shipDate?: string | null;
  sku?: string | null;
  packaging?: string | null;
  productName?: string | null;
};

/** PrepCorex consolidated drafts start as DRAFT-PCX-… — never mirror that as the final number. */
export function isDraftPlaceholderInvoiceNumber(value?: string | null): boolean {
  const n = String(value || "").trim();
  if (!n) return true;
  return /^draft(\b|-|_)/i.test(n);
}

export function createCrmInvoiceNumber(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const randomNum = Math.floor(Math.random() * 1000).toString().padStart(3, "0");
  return `INV-${year}${month}-${randomNum}`;
}

/**
 * When CRM sends a PrepCorex-consolidated draft, optionally create a matching
 * pending invoice under users/{clientUid}/invoices (PrepCorex client portal).
 */
export async function mirrorCrmInvoiceToPrepcorex(input: {
  clientUserId: string;
  invoice: {
    id: string;
    invoiceNumber: string;
    invoiceDate?: string;
    dueDate?: string;
    clientName?: string;
    clientEmail?: string;
    clientPhone?: string;
    clientAddress?: string;
    items?: CrmItem[];
    shippingLabelItems?: CrmItem[];
    subtotal?: number;
    total?: number;
    salesTax?: number;
    shippingCost?: number;
    /** Per-client CRM template fields → PrepCorex PDF / portal. */
    terms?: string | null;
    invoiceNote?: string | null;
    fobPoint?: string | null;
    shippingTerms?: string | null;
    shippedVia?: string | null;
    companyName?: string | null;
    companyAddress?: string | null;
    companyCityStateZip?: string | null;
    companyCountry?: string | null;
    companyPhone?: string | null;
    companyEmail?: string | null;
  };
}): Promise<{ prepcorexInvoiceId: string; invoiceNumber: string }> {
  const clientUserId = String(input.clientUserId || "").trim();
  if (!clientUserId) throw new Error("Missing PrepCorex client user id");

  let invoiceNumber = String(input.invoice.invoiceNumber || "").trim();
  if (isDraftPlaceholderInvoiceNumber(invoiceNumber)) {
    invoiceNumber = createCrmInvoiceNumber();
    await updateDoc(doc(db, "external_invoices", input.invoice.id), {
      invoiceNumber,
      updatedAt: serverTimestamp(),
    });
  }

  const mapLines = (rows: CrmItem[] | undefined) =>
    (rows || [])
      .filter((row) => String(row.description || row.productName || "").trim())
      .map((row) => {
        const quantity = Number(row.quantity) || 0;
        const unitPrice = Number(row.unitPrice) || 0;
        const amount =
          Number(row.amount) ||
          Math.round(quantity * unitPrice * 100) / 100;
        const raw = String(row.description || row.productName || "").trim();
        const parsed = parseCrmStyleInvoiceLine(raw);
        const shipDate =
          String(row.shipDate || "").trim() ||
          parsed.shipDate ||
          format(new Date(), "dd/MM/yyyy");
        const sku = String(row.sku || "").trim() || parsed.sku || "";
        const packaging =
          String(row.packaging || "").trim() ||
          parsed.packaging ||
          "Service";
        return {
          quantity,
          productName: parsed.productName || raw,
          shipDate,
          sku,
          packaging,
          shipTo: "",
          unitPrice,
          amount,
        };
      });

  const items = [
    ...mapLines(input.invoice.items),
    ...mapLines(input.invoice.shippingLabelItems),
  ];
  const subtotal =
    Number(input.invoice.subtotal) ||
    items.reduce((sum, line) => sum + Number(line.amount || 0), 0);
  const grandTotal = Number(input.invoice.total) || subtotal;

  // Prefer admin-saved per-client template over invoice snapshot when present.
  let template: Awaited<ReturnType<typeof getClientInvoiceTemplate>> = null;
  try {
    template = await getClientInvoiceTemplate({
      email: input.invoice.clientEmail,
      prepcorexClientUserId: clientUserId,
    });
  } catch {
    template = null;
  }

  const pick = (invoiceValue: unknown, templateValue: unknown) => {
    const fromInvoice = String(invoiceValue || "").trim();
    if (fromInvoice) return fromInvoice;
    return String(templateValue || "").trim();
  };

  const terms = pick(input.invoice.terms, template?.terms);
  const invoiceNote = pick(input.invoice.invoiceNote, template?.invoiceNote);
  const fobPoint = pick(input.invoice.fobPoint, template?.fobPoint);
  const shippingTerms = pick(input.invoice.shippingTerms, template?.shippingTerms);
  const shippedVia = pick(input.invoice.shippedVia, template?.shippedVia);

  const companyFields: Record<string, string> = {};
  const companyName = pick(input.invoice.companyName, template?.companyName);
  const companyAddress = pick(input.invoice.companyAddress, template?.companyAddress);
  const companyCityStateZip = pick(
    input.invoice.companyCityStateZip,
    template?.companyCityStateZip
  );
  const companyCountry = pick(input.invoice.companyCountry, template?.companyCountry);
  const companyPhone = pick(input.invoice.companyPhone, template?.companyPhone);
  const companyEmail = pick(input.invoice.companyEmail, template?.companyEmail);
  if (companyName) companyFields.companyName = companyName;
  if (companyAddress) companyFields.companyAddress = companyAddress;
  if (companyCityStateZip) companyFields.companyCityStateZip = companyCityStateZip;
  if (companyCountry) companyFields.companyCountry = companyCountry;
  if (companyPhone) companyFields.companyPhone = companyPhone;
  if (companyEmail) companyFields.companyEmail = companyEmail;

  const ref = await addDoc(collection(db, `users/${clientUserId}/invoices`), {
    invoiceNumber,
    date: input.invoice.invoiceDate || format(new Date(), "yyyy-MM-dd"),
    dueDate: input.invoice.dueDate || null,
    orderNumber: `CRM-${invoiceNumber}`,
    soldTo: {
      name: input.invoice.clientName || "Client",
      email: input.invoice.clientEmail || "",
      phone: input.invoice.clientPhone || "",
      address: input.invoice.clientAddress || "",
    },
    fbm: "Standard Shipping",
    items,
    subtotal,
    grandTotal,
    status: "pending",
    type: "crm_mirrored",
    source: "crm_external_invoice_mirror",
    crmExternalInvoiceId: input.invoice.id,
    // Opt-in for PrepCorex client email automation (future mirrors only).
    enableClientInvoiceEmails: true,
    ...(terms ? { terms } : {}),
    ...(invoiceNote ? { invoiceNote } : {}),
    ...(fobPoint ? { fobPoint } : {}),
    ...(shippingTerms ? { shippingTerms } : {}),
    ...(shippedVia ? { shippedVia } : {}),
    ...companyFields,
    createdAt: new Date(),
    updatedAt: new Date(),
    userId: clientUserId,
  });

  await updateDoc(doc(db, "external_invoices", input.invoice.id), {
    prepcorexMirroredInvoiceId: ref.id,
    prepcorexMirroredAt: serverTimestamp(),
    showInPrepcorex: true,
    updatedAt: serverTimestamp(),
  });

  return { prepcorexInvoiceId: ref.id, invoiceNumber };
}
