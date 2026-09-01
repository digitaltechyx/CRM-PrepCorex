import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { ensureMercuryInvoiceForCrmInvoice } from "@/lib/mercury-invoice-sync";
import { readMercuryConfigFromEnv } from "@/lib/mercury";

export const dynamic = "force-dynamic";

function normalizeRole(v: unknown): string {
  return String(v || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function isAdminLikeToken(claims: Record<string, unknown> | null | undefined): boolean {
  if (!claims) return false;
  if (claims.admin === true || claims.isAdmin === true) return true;
  if (claims.sub_admin === true || claims.subAdmin === true || claims.isSubAdmin === true) return true;
  const role = normalizeRole(claims.role);
  if (role === "admin" || role === "sub_admin" || role === "subadmin") return true;
  const roles = Array.isArray(claims.roles) ? claims.roles.map(normalizeRole) : [];
  return roles.includes("admin") || roles.includes("sub_admin") || roles.includes("subadmin");
}

function isAdminLikeUserDoc(data: Record<string, unknown> | null | undefined): boolean {
  if (!data) return false;
  if (data.isAdmin === true || data.admin === true || data.is_admin === true) return true;
  if (data.isSubAdmin === true || data.is_sub_admin === true) return true;
  const role = normalizeRole(data.role || data.userRole || data.userType);
  if (role === "admin" || role === "sub_admin" || role === "subadmin") return true;
  const roles = Array.isArray(data.roles) ? data.roles.map(normalizeRole) : [];
  return roles.includes("admin") || roles.includes("sub_admin") || roles.includes("subadmin");
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
    if (isAdminLikeToken(decoded as Record<string, unknown>)) return { ok: true as const, uid };

    const snap = await adminDb().collection("users").doc(uid).get();
    const data = snap.exists ? (snap.data() as Record<string, unknown>) : null;
    if (!snap.exists || !isAdminLikeUserDoc(data)) {
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

  if (!readMercuryConfigFromEnv()) {
    return NextResponse.json({ error: "Mercury is not configured." }, { status: 503 });
  }

  let body: { invoiceId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const invoiceId = String(body.invoiceId || "").trim();
  if (!invoiceId) {
    return NextResponse.json({ error: "invoiceId is required." }, { status: 400 });
  }

  try {
    const ref = adminDb().collection("external_invoices").doc(invoiceId);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
    }

    const invoice = { id: snap.id, ...(snap.data() as Record<string, unknown>) } as Parameters<
      typeof ensureMercuryInvoiceForCrmInvoice
    >[0];

    const mercury = await ensureMercuryInvoiceForCrmInvoice(invoice);
    await ref.update({
      mercuryCustomerId: mercury.mercuryCustomerId,
      mercuryInvoiceId: mercury.mercuryInvoiceId,
      mercuryPaymentUrl: mercury.mercuryPaymentUrl,
      mercuryInvoiceStatus: mercury.mercuryInvoiceStatus,
      updatedAt: new Date(),
    });

    return NextResponse.json({ success: true, ...mercury });
  } catch (error) {
    console.error("Mercury invoice create error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create Mercury invoice." },
      { status: 500 }
    );
  }
}
