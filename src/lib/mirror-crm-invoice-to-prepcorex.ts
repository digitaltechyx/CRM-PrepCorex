import { addDoc, collection, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { format } from "date-fns";
import { db } from "@/lib/firebase";

type CrmItem = {
  description?: string;
  quantity?: number;
  unitPrice?: number;
  amount?: number;
};

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
  };
}): Promise<{ prepcorexInvoiceId: string }> {
  const clientUserId = String(input.clientUserId || "").trim();
  if (!clientUserId) throw new Error("Missing PrepCorex client user id");

  const mapLines = (rows: CrmItem[] | undefined) =>
    (rows || [])
      .filter((row) => String(row.description || "").trim())
      .map((row) => {
        const quantity = Number(row.quantity) || 0;
        const unitPrice = Number(row.unitPrice) || 0;
        const amount =
          Number(row.amount) ||
          Math.round(quantity * unitPrice * 100) / 100;
        return {
          quantity,
          productName: String(row.description || "").trim(),
          shipDate: format(new Date(), "dd/MM/yyyy"),
          packaging: "Service",
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

  const ref = await addDoc(collection(db, `users/${clientUserId}/invoices`), {
    invoiceNumber: input.invoice.invoiceNumber,
    date: input.invoice.invoiceDate || format(new Date(), "yyyy-MM-dd"),
    dueDate: input.invoice.dueDate || null,
    orderNumber: `CRM-${input.invoice.invoiceNumber}`,
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

  return { prepcorexInvoiceId: ref.id };
}
