/**
 * Admin-only API: Generate a test storage invoice for a single user + month.
 * - Auth: Firebase ID token (Authorization: Bearer <idToken>)
 * - No CRON secret required
 */

import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { format } from "date-fns";
import { generateInvoiceNumber } from "@/lib/invoice-utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function normalizeRole(v: any): string {
  return String(v || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function isAdminLikeUserDoc(data: any): boolean {
  if (!data) return false;
  if (data.isAdmin === true || data.admin === true || data.is_admin === true) return true;
  if (data.isSubAdmin === true || data.is_sub_admin === true) return true;
  const role = normalizeRole(data.role || data.userRole || data.userType);
  if (role === "admin" || role === "sub_admin" || role === "subadmin") return true;
  const roles = Array.isArray(data.roles) ? data.roles.map(normalizeRole) : [];
  if (roles.includes("admin") || roles.includes("sub_admin") || roles.includes("subadmin")) return true;
  if (Array.isArray(data.features)) {
    if (data.features.includes("admin_dashboard") || data.features.includes("manage_invoices") || data.features.includes("manage_users")) return true;
  } else if (data.features && typeof data.features === "object") {
    if (data.features.admin_dashboard === true || data.features.manage_invoices === true || data.features.manage_users === true) return true;
  }
  return false;
}

async function requireAdmin(request: NextRequest) {
  const header = request.headers.get("authorization") || "";
  if (!header.startsWith("Bearer ")) {
    return { ok: false as const, status: 401, error: "Unauthorized" };
  }

  const token = header.slice("Bearer ".length).trim();
  if (!token) return { ok: false as const, status: 401, error: "Unauthorized" };

  try {
    const decoded = await adminAuth().verifyIdToken(token);
    const uid = decoded?.uid;
    if (!uid) return { ok: false as const, status: 401, error: "Unauthorized" };

    const db = adminDb();
    const snap = await db.collection("users").doc(uid).get();
    const data = snap.exists ? snap.data() : null;
    if (!isAdminLikeUserDoc(data)) {
      return { ok: false as const, status: 403, error: "Forbidden" };
    }

    return { ok: true as const, uid };
  } catch {
    return { ok: false as const, status: 401, error: "Unauthorized" };
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const userId = String(body?.userId || "").trim();
    const monthParam = String(body?.month || "").trim(); // YYYY-MM

    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    const db = adminDb();
    const userSnap = await db.collection("users").doc(userId).get();
    if (!userSnap.exists) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const userData = userSnap.data() || {};

    // Only generate for approved users (same as cron job)
    if (userData.status === "deleted" || (userData.status && userData.status !== "approved")) {
      return NextResponse.json({ error: "User is not approved" }, { status: 400 });
    }

    // Month parsing
    const now = new Date();
    let invoiceMonthBase = format(now, "yyyy-MM");
    let monthDate = new Date(now.getFullYear(), now.getMonth(), 1);
    if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
      const [y, m] = monthParam.split("-").map((v: string) => Number(v));
      if (Number.isFinite(y) && Number.isFinite(m) && m >= 1 && m <= 12) {
        invoiceMonthBase = monthParam;
        monthDate = new Date(y, m - 1, 1);
      }
    }

    const invoiceMonthForDoc = `${invoiceMonthBase}-test-${format(now, "yyyyMMdd-HHmmss")}`;
    const firstDayOfMonth = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    const lastDayOfMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);

    const storageType = userData.storageType;
    if (!storageType) {
      return NextResponse.json({ error: "User has no storageType" }, { status: 400 });
    }

    const storagePricingSnapshot = await db
      .collection(`users/${userId}/storagePricing`)
      .get();

    if (storagePricingSnapshot.empty) {
      return NextResponse.json({ error: "No storage pricing configured" }, { status: 400 });
    }

    const toMs = (v: any): number => {
      if (!v) return 0;
      if (typeof v === "string") {
        const t = new Date(v).getTime();
        return Number.isNaN(t) ? 0 : t;
      }
      if (typeof v === "object" && typeof v.toDate === "function") {
        return v.toDate().getTime();
      }
      if (typeof v === "object" && typeof v.seconds === "number") return v.seconds * 1000;
      if (v instanceof Date) return v.getTime();
      return 0;
    };

    const latestPricingDoc = [...storagePricingSnapshot.docs].sort((a, b) => {
      const ad: any = a.data();
      const bd: any = b.data();
      const at = Math.max(toMs(ad.updatedAt), toMs(ad.createdAt));
      const bt = Math.max(toMs(bd.updatedAt), toMs(bd.createdAt));
      return bt - at;
    })[0];

    const storagePricing = latestPricingDoc.data();
    const price = storagePricing.price;
    if (!price || price <= 0) {
      return NextResponse.json({ error: "Invalid storage price" }, { status: 400 });
    }

    let totalAmount = 0;
    let itemCount = 0;
    const invoiceItems: any[] = [];

    if (storageType === "product_base") {
      // Count "In Stock" items excluding items added in target month (first month free)
      const inventorySnapshot = await db
        .collection(`users/${userId}/inventory`)
        .where("status", "==", "In Stock")
        .get();

      for (const inventoryDoc of inventorySnapshot.docs) {
        const inventoryData = inventoryDoc.data();
        const dateAdded = inventoryData.dateAdded;
        let itemDateAdded: Date;
        if (dateAdded && typeof dateAdded === "object" && "seconds" in dateAdded) {
          itemDateAdded = new Date(dateAdded.seconds * 1000);
        } else if (typeof dateAdded === "string") {
          itemDateAdded = new Date(dateAdded);
        } else {
          itemDateAdded = new Date();
        }

        if (itemDateAdded >= firstDayOfMonth && itemDateAdded <= lastDayOfMonth) {
          continue;
        }

        const quantity = inventoryData.quantity || 0;
        itemCount += quantity;
      }

      totalAmount = itemCount * price;

      invoiceItems.push({
        quantity: itemCount,
        productName: `Storage - Product Base (${itemCount} items)`,
        shipDate: invoiceMonthBase,
        shipTo: "N/A",
        packaging: "Storage",
        unitPrice: price,
        amount: totalAmount,
      });
    } else if (storageType === "pallet_base") {
      const palletCount = storagePricing.palletCount || 1;
      totalAmount = palletCount * price;
      itemCount = palletCount;

      invoiceItems.push({
        quantity: palletCount,
        productName: `Storage - Pallet Base (${palletCount} pallet${palletCount > 1 ? "s" : ""})`,
        shipDate: invoiceMonthBase,
        shipTo: "N/A",
        packaging: "Storage",
        unitPrice: price,
        amount: totalAmount,
      });
    } else {
      return NextResponse.json({ error: `Unsupported storageType: ${storageType}` }, { status: 400 });
    }

    if (totalAmount <= 0) {
      return NextResponse.json({ error: "No charge for this month (0 items/pallets)" }, { status: 400 });
    }

    const invoiceNumber = generateInvoiceNumber(now);
    const orderNumber = `STOR-${format(now, "yyyyMMdd")}-${Date.now().toString().slice(-4)}`;

    const invoiceDoc = {
      invoiceNumber,
      date: format(now, "yyyy-MM-dd"),
      orderNumber,
      soldTo: {
        name: userData.name || userData.companyName || "Client",
        email: userData.email || "",
        phone: userData.phone || "",
        address: userData.address || "",
      },
      fbm: "Storage Fee",
      items: invoiceItems,
      subtotal: totalAmount,
      grandTotal: totalAmount,
      status: "pending",
      createdAt: new Date(),
      userId,
      type: "storage",
      invoiceMonth: invoiceMonthForDoc,
      autoGenerated: true,
      autoGeneratedAt: new Date(),
      storageType,
      itemCount,
      ...(storageType === "pallet_base" && { palletCount: storagePricing.palletCount || 1 }),
      isTest: true,
      testRunAt: new Date(),
      testOfInvoiceMonth: invoiceMonthBase,
      generatedByAdminUid: auth.uid,
    };

    await db.collection(`users/${userId}/invoices`).add(invoiceDoc);

    return NextResponse.json({
      success: true,
      invoiceNumber,
      invoiceMonth: invoiceMonthForDoc,
    });
  } catch (error: any) {
    console.error("Admin storage test invoice generation failed:", error);
    return NextResponse.json(
      {
        error: "Monthly storage invoice generation failed",
        details: error?.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}


