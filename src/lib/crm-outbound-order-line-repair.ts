"use client";

import { format } from "date-fns";
import { doc, getDoc, serverTimestamp, updateDoc, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { buildPrepcorexOrderOpenUrl } from "@/lib/prepcorex-order-open";

async function relinkPrepcorexOutboundDocs(input: {
  clientUserId: string;
  invoiceId: string;
  orderIds: string[];
  shippedIds: string[];
}): Promise<void> {
  const uid = String(input.clientUserId || "").trim();
  const invoiceId = String(input.invoiceId || "").trim();
  if (!uid || !invoiceId) return;
  const linkFields = {
    invoiceStatus: "crm_draft",
    crmExternalInvoiceId: invoiceId,
    crmDraftSyncedAt: serverTimestamp(),
  };
  const batch = writeBatch(db);
  let ops = 0;
  for (const shippedId of input.shippedIds) {
    const id = String(shippedId || "").trim();
    if (!id) continue;
    const ref = doc(db, `users/${uid}/shipped`, id);
    try {
      const snap = await getDoc(ref);
      if (!snap.exists()) continue;
      batch.update(ref, linkFields);
      ops += 1;
    } catch {
      /* skip */
    }
  }
  for (const orderId of input.orderIds) {
    const id = String(orderId || "").trim();
    if (!id) continue;
    const ref = doc(db, `users/${uid}/shipmentRequests`, id);
    try {
      const snap = await getDoc(ref);
      if (!snap.exists()) continue;
      batch.update(ref, linkFields);
      ops += 1;
    } catch {
      /* skip */
    }
  }
  if (ops > 0) await batch.commit();
}

function money(n: unknown): number {
  const v = Number(n);
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : 0;
}

function newLineId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `line_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function formatShipDate(value: unknown): string {
  if (typeof value === "string" && value.trim()) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return format(d, "dd/MM/yyyy");
    return value.trim();
  }
  if (value && typeof value === "object") {
    if (typeof (value as { toDate?: () => Date }).toDate === "function") {
      const d = (value as { toDate: () => Date }).toDate();
      if (d instanceof Date && !Number.isNaN(d.getTime())) return format(d, "dd/MM/yyyy");
    }
    const seconds = Number((value as { seconds?: number }).seconds || 0);
    if (seconds > 0) return format(new Date(seconds * 1000), "dd/MM/yyyy");
  }
  return "";
}

function orderLineSourceKey(orderNumber: string): string {
  return `request:${String(orderNumber || "").trim()}:order`;
}

function isLegacyDetailKey(sourceKey: string, orderNumber: string): boolean {
  const key = String(sourceKey || "").trim();
  const order = String(orderNumber || "").trim();
  if (!key || !order) return false;
  return key.startsWith(`request:${order}:`) && key !== orderLineSourceKey(order);
}

function isOrderDescription(description: unknown): boolean {
  return /^Order\s+[A-Za-z0-9_-]+/i.test(String(description || "").trim());
}

function formatOrderDescription(orderNumber: string, requestedDate?: string): string {
  const order = String(orderNumber || "").trim();
  if (!order) return "";
  const requested = String(requestedDate || "").trim();
  return requested ? `Order ${order} · Requested ${requested}` : `Order ${order}`;
}

async function resolveRequestedDate(clientUserId: string, orderId: string): Promise<string> {
  const uid = String(clientUserId || "").trim();
  const id = String(orderId || "").trim();
  if (!uid || !id) return "";
  try {
    const snap = await getDoc(doc(db, `users/${uid}/shipmentRequests`, id));
    if (!snap.exists()) return "";
    const data = snap.data() || {};
    return formatShipDate(data.requestedAt ?? data.date ?? data.createdAt);
  } catch {
    return "";
  }
}

/**
 * Convert old CRM per-SKU / service breakdown rows into one Order … line per outbound.
 */
export async function collapseLegacyCrmInvoiceItemsToOrderLines(
  externalInvoiceId: string
): Promise<{ repaired: boolean; orderCount: number }> {
  const invoiceId = String(externalInvoiceId || "").trim();
  if (!invoiceId) return { repaired: false, orderCount: 0 };

  const ref = doc(db, "external_invoices", invoiceId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return { repaired: false, orderCount: 0 };

  const data = snap.data() || {};
  const clientUserId = String(data.prepcorexClientUserId || "").trim();
  let nextItems: any[] = Array.isArray(data.items) ? [...(data.items as any[])] : [];
  if (nextItems.length === 0) return { repaired: false, orderCount: 0 };

  const orderIds = new Set<string>();
  for (const id of Array.isArray(data.prepcorexShipmentRequestIds)
    ? (data.prepcorexShipmentRequestIds as unknown[])
    : []) {
    const v = String(id || "").trim();
    if (v) orderIds.add(v);
  }
  for (const it of nextItems) {
    const keyMatch = /^request:([^:]+):/.exec(String(it?.sourceKey || "").trim());
    if (keyMatch?.[1]) orderIds.add(keyMatch[1]);
    const on = String(it?.orderNumber || "").trim();
    if (on) orderIds.add(on);
  }

  let changed = false;
  let orderCount = 0;

  const rebuild = async (orderId: string, linesForOrder: any[]) => {
    const requestedDate = await resolveRequestedDate(clientUserId, orderId);
    const shipDate =
      linesForOrder.map((it) => String(it?.shipDate || "").trim()).find(Boolean) || "";
    const totalForOrder = money(
      linesForOrder.reduce((sum, it) => sum + money(it?.amount), 0)
    );
    const existingId =
      linesForOrder.find(
        (it) => String(it?.sourceKey || "").trim() === orderLineSourceKey(orderId)
      )?.id ||
      linesForOrder.find((it) => isOrderDescription(it?.description))?.id ||
      newLineId();
    const orderUrl = clientUserId
      ? buildPrepcorexOrderOpenUrl(clientUserId, orderId)
      : "";
    return {
      id: existingId,
      description: formatOrderDescription(orderId, requestedDate),
      quantity: 1,
      unitPrice: totalForOrder,
      compareUnitPrice: 0,
      amount: totalForOrder,
      orderNumber: orderId,
      packaging: "Outbound",
      sourceKey: orderLineSourceKey(orderId),
      ...(orderUrl ? { orderUrl } : {}),
      ...(shipDate ? { shipDate } : {}),
      ...(requestedDate ? { requestedDate } : {}),
    };
  };

  for (const orderId of orderIds) {
    if (!orderId) continue;
    const legacy = nextItems.filter((it) =>
      isLegacyDetailKey(String(it?.sourceKey || ""), orderId)
    );
    const orderKey = orderLineSourceKey(orderId);
    const existingOrderLines = nextItems.filter(
      (it) =>
        String(it?.sourceKey || "").trim() === orderKey ||
        (String(it?.orderNumber || "").trim() === orderId &&
          isOrderDescription(it?.description))
    );

    if (legacy.length === 0) {
      if (existingOrderLines.length === 1) {
        const refreshed = await rebuild(orderId, existingOrderLines);
        const prev = existingOrderLines[0];
        if (String(prev?.description || "") !== refreshed.description) {
          nextItems = nextItems.map((it) => (it === prev ? refreshed : it));
          changed = true;
          orderCount += 1;
        }
      }
      continue;
    }

    const collapsed = await rebuild(orderId, [...legacy, ...existingOrderLines]);
    nextItems = [
      ...nextItems.filter(
        (it) =>
          !isLegacyDetailKey(String(it?.sourceKey || ""), orderId) &&
          String(it?.sourceKey || "").trim() !== orderKey &&
          !(
            String(it?.orderNumber || "").trim() === orderId &&
            isOrderDescription(it?.description)
          )
      ),
      collapsed,
    ];
    changed = true;
    orderCount += 1;
  }

  if (!changed && orderIds.size === 1) {
    const orderId = [...orderIds][0];
    const hasBreakdown = nextItems.some((it) => !isOrderDescription(it?.description));
    const hasOrderLine = nextItems.some((it) => isOrderDescription(it?.description));
    if (hasBreakdown && (!hasOrderLine || nextItems.length > 1)) {
      nextItems = [await rebuild(orderId, nextItems)];
      changed = true;
      orderCount = 1;
    }
  }

  const shippedIds = Array.isArray(data.prepcorexShippedIds)
    ? (data.prepcorexShippedIds as unknown[]).map((id) => String(id || "").trim()).filter(Boolean)
    : [];

  if (!changed) {
    if (clientUserId && orderIds.size > 0) {
      try {
        await relinkPrepcorexOutboundDocs({
          clientUserId,
          invoiceId,
          orderIds: [...orderIds],
          shippedIds,
        });
      } catch (linkErr) {
        console.warn("[crm-invoice] could not re-link PrepCorex docs", linkErr);
      }
    }
    return { repaired: false, orderCount: 0 };
  }

  const subtotal = money(nextItems.reduce((sum, it) => sum + money(it?.amount), 0));
  const salesTax = money(data.salesTax);
  const shippingCost = money(data.shippingCost);
  const lateFee = money(data.lateFee);
  const amountPaid = money(data.amountPaid);
  const total = money(subtotal + salesTax + shippingCost);

  await updateDoc(ref, {
    items: nextItems,
    subtotal,
    total,
    outstandingBalance: money(total + lateFee - amountPaid),
    updatedAt: serverTimestamp(),
    lastPrepcorexOrderLineRepairAt: serverTimestamp(),
  });

  if (clientUserId && orderIds.size > 0) {
    try {
      await relinkPrepcorexOutboundDocs({
        clientUserId,
        invoiceId,
        orderIds: [...orderIds],
        shippedIds,
      });
    } catch (linkErr) {
      console.warn("[crm-invoice] could not re-link PrepCorex docs after repair", linkErr);
    }
  }

  return { repaired: true, orderCount };
}
