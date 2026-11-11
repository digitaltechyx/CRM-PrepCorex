/** Matches PrepCorex monthly storage → CRM draft billingSource. */
export const CRM_STORAGE_DRAFT_BILLING_SOURCE = "prepcorex_storage_monthly";

export function isCrmStorageDraftInvoice(invoice: {
  billingSource?: string | null;
  type?: string | null;
  invoiceNumber?: string | null;
}): boolean {
  if (String(invoice.billingSource || "").trim() === CRM_STORAGE_DRAFT_BILLING_SOURCE) {
    return true;
  }
  if (String(invoice.type || "").trim().toLowerCase() === "storage") return true;
  if (/^DRAFT-STOR/i.test(String(invoice.invoiceNumber || "").trim())) return true;
  return false;
}
