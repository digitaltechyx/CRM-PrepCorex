import crypto from "crypto";
import type { Firestore } from "firebase-admin/firestore";
import {
  getMercuryInvoiceViaProxy,
  readMercuryProxyFromEnv,
} from "@/lib/mercury-proxy-client";
import {
  buildMercuryPayUrl,
  createMercuryInvoice,
  findOrCreateMercuryCustomer,
  getMercuryInvoice,
  readMercuryConfigFromEnv,
  type MercuryLineItem,
  type MercuryInvoice,
} from "@/lib/mercury";

export type CrmInvoiceForMercury = {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  clientName: string;
  clientEmail: string;
  items: Array<{ description?: string; quantity?: number; unitPrice?: number; amount?: number }>;
  subtotal: number;
  salesTax: number;
  shippingCost: number;
  total: number;
  lateFee?: number;
  discountType?: "percentage" | "amount";
  discountValue?: number;
  amountPaid?: number;
  mercuryCustomerId?: string | null;
  mercuryInvoiceId?: string | null;
};

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function getDiscountAmount(invoice: CrmInvoiceForMercury): number {
  const value = Number(invoice.discountValue ?? 0);
  if (!value) return 0;
  if (invoice.discountType === "percentage") {
    return roundMoney((Number(invoice.subtotal || 0) * value) / 100);
  }
  return roundMoney(value);
}

function getInvoiceTotal(invoice: CrmInvoiceForMercury): number {
  const discount = getDiscountAmount(invoice);
  const lateFee = Number(invoice.lateFee ?? 0);
  return roundMoney(
    Number(invoice.subtotal || 0) +
      Number(invoice.salesTax || 0) +
      Number(invoice.shippingCost || 0) -
      discount +
      lateFee
  );
}

export function buildMercuryLineItems(invoice: CrmInvoiceForMercury): MercuryLineItem[] {
  const lines: MercuryLineItem[] = (invoice.items || [])
    .filter((item) => Number(item.quantity || 0) > 0)
    .map((item) => ({
      name: String(item.description || "Service").slice(0, 200),
      quantity: Number(item.quantity || 1),
      unitPrice: roundMoney(Number(item.unitPrice || item.amount || 0)),
    }));

  if (Number(invoice.salesTax || 0) > 0) {
    lines.push({ name: "Sales tax", quantity: 1, unitPrice: roundMoney(Number(invoice.salesTax)) });
  }
  if (Number(invoice.shippingCost || 0) > 0) {
    lines.push({
      name: "Shipping",
      quantity: 1,
      unitPrice: roundMoney(Number(invoice.shippingCost)),
    });
  }

  const discount = getDiscountAmount(invoice);
  if (discount > 0) {
    lines.push({ name: "Discount", quantity: 1, unitPrice: -discount });
  }
  if (Number(invoice.lateFee || 0) > 0) {
    lines.push({
      name: "Late fee",
      quantity: 1,
      unitPrice: roundMoney(Number(invoice.lateFee)),
    });
  }

  if (lines.length === 0) {
    lines.push({
      name: `Invoice ${invoice.invoiceNumber}`,
      quantity: 1,
      unitPrice: getInvoiceTotal(invoice) || roundMoney(Number(invoice.total || 0)),
    });
  }

  return lines;
}

export async function ensureMercuryInvoiceForCrmInvoice(
  invoice: CrmInvoiceForMercury
): Promise<{
  mercuryCustomerId: string;
  mercuryInvoiceId: string;
  mercuryPaymentUrl: string;
  mercuryInvoiceStatus: string;
}> {
  const config = readMercuryConfigFromEnv();
  if (!config) {
    throw new Error("Mercury is not configured. Set MERCURY_API_TOKEN and MERCURY_DESTINATION_ACCOUNT_ID.");
  }
  if (!invoice.clientEmail?.trim()) {
    throw new Error("Client email is required for Mercury payment link.");
  }

  if (invoice.mercuryInvoiceId) {
    const existing = await getMercuryInvoice(config, invoice.mercuryInvoiceId);
    return {
      mercuryCustomerId: existing.customerId,
      mercuryInvoiceId: existing.id,
      mercuryPaymentUrl: buildMercuryPayUrl(existing.slug, config),
      mercuryInvoiceStatus: existing.status,
    };
  }

  const customer = await findOrCreateMercuryCustomer(config, {
    name: invoice.clientName || invoice.clientEmail,
    email: invoice.clientEmail.trim(),
    existingCustomerId: invoice.mercuryCustomerId,
  });

  const mercuryInvoice = await createMercuryInvoice(config, {
    customerId: customer.id,
    invoiceNumber: invoice.invoiceNumber,
    invoiceDate: invoice.invoiceDate,
    dueDate: invoice.dueDate,
    lineItems: buildMercuryLineItems(invoice),
    payerMemo: `Prep Services FBA invoice ${invoice.invoiceNumber}`,
    internalNote: `PSF CRM invoice ${invoice.id}`,
  });

  return {
    mercuryCustomerId: customer.id,
    mercuryInvoiceId: mercuryInvoice.id,
    mercuryPaymentUrl: buildMercuryPayUrl(mercuryInvoice.slug, config),
    mercuryInvoiceStatus: mercuryInvoice.status,
  };
}

async function fetchMercuryInvoiceById(mercuryInvoiceId: string): Promise<MercuryInvoice> {
  const proxy = readMercuryProxyFromEnv();
  if (proxy) {
    return getMercuryInvoiceViaProxy(proxy, mercuryInvoiceId);
  }
  const config = readMercuryConfigFromEnv();
  if (!config) {
    throw new Error("Mercury is not configured.");
  }
  return getMercuryInvoice(config, mercuryInvoiceId);
}

export async function syncOpenMercuryInvoices(
  db: Firestore,
  fieldValue: FirebaseFirestore.FieldValue
): Promise<{ checked: number; updated: number }> {
  const snap = await db
    .collection("external_invoices")
    .where("status", "in", ["sent", "partially_paid", "overdue"])
    .limit(100)
    .get();

  let checked = 0;
  let updated = 0;

  for (const docSnap of snap.docs) {
    const data = docSnap.data() as Record<string, unknown>;
    const status = String(data.status || "");
    if (status === "paid" || status === "cancelled") continue;

    const mercuryInvoiceId = String(data.mercuryInvoiceId || "");
    if (!mercuryInvoiceId) continue;

    checked += 1;
    const mercuryInvoice = await fetchMercuryInvoiceById(mercuryInvoiceId);
    if (mercuryInvoice.status !== "Paid") continue;

    const invoiceTotal = getInvoiceTotal(data as CrmInvoiceForMercury);
    const currentPaid = Number(data.amountPaid ?? 0);
    const amountToApply = roundMoney(Math.max(0, invoiceTotal - currentPaid));
    if (amountToApply <= 0 && currentPaid >= invoiceTotal) continue;

    const payments = Array.isArray(data.payments) ? [...data.payments] : [];
    payments.push({
      id: crypto.randomUUID(),
      amount: amountToApply > 0 ? amountToApply : invoiceTotal,
      date: new Date().toISOString().slice(0, 10),
      method: "Mercury",
      reference: mercuryInvoiceId,
      notes: "Auto-recorded from Mercury webhook",
      createdAt: new Date().toISOString(),
    });

    const updatedPaid = roundMoney(currentPaid + (amountToApply > 0 ? amountToApply : invoiceTotal - currentPaid));
    const outstanding = roundMoney(Math.max(0, invoiceTotal - updatedPaid));

    await docSnap.ref.update({
      amountPaid: updatedPaid,
      outstandingBalance: outstanding,
      status: outstanding === 0 ? "paid" : "partially_paid",
      payments,
      mercuryInvoiceStatus: mercuryInvoice.status,
      mercurySyncedAt: fieldValue.serverTimestamp(),
      updatedAt: fieldValue.serverTimestamp(),
    });
    updated += 1;
  }

  return { checked, updated };
}
