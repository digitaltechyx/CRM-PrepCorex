import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb, adminFieldValue } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";

type InvoiceEmailLogType =
  | "invoice_sent"
  | "reminder_24h"
  | "overdue"
  | "second_reminder"
  | "payment_confirmation"
  | "resend"
  | "discount_update";

function normalizeRole(v: unknown): string {
  return String(v || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function isAdminLikeToken(claims: Record<string, unknown> | undefined): boolean {
  if (!claims) return false;
  if (claims.admin === true || claims.isAdmin === true) return true;
  if (claims.sub_admin === true || claims.subAdmin === true || claims.isSubAdmin === true) return true;
  const role = normalizeRole(claims.role);
  if (role === "admin" || role === "sub_admin" || role === "subadmin") return true;
  const roles = Array.isArray(claims.roles) ? claims.roles.map(normalizeRole) : [];
  return roles.includes("admin") || roles.includes("sub_admin") || roles.includes("subadmin");
}

function isAdminLikeUserDoc(data: Record<string, unknown> | undefined): boolean {
  if (!data) return false;
  if (data.isAdmin === true || data.admin === true || data.is_admin === true) return true;
  if (data.isSubAdmin === true || data.is_sub_admin === true) return true;
  const role = normalizeRole(data.role || data.userRole || data.userType);
  if (role === "admin" || role === "sub_admin" || role === "subadmin") return true;
  const roles = Array.isArray(data.roles) ? data.roles.map(normalizeRole) : [];
  if (roles.includes("admin") || roles.includes("sub_admin") || roles.includes("subadmin")) return true;
  return false;
}

async function requireAdmin(request: NextRequest): Promise<
  | { ok: true; uid: string; email?: string }
  | { ok: false; status: number; error: string }
> {
  const header = request.headers.get("authorization") || "";
  if (!header.startsWith("Bearer ")) {
    return { ok: false, status: 401, error: "Unauthorized: Missing or invalid authorization header" };
  }

  const token = header.slice("Bearer ".length).trim();
  if (!token) {
    return { ok: false, status: 401, error: "Unauthorized: Empty token" };
  }

  try {
    const decoded = await adminAuth().verifyIdToken(token);
    const uid = decoded?.uid;
    if (!uid) {
      return { ok: false, status: 401, error: "Unauthorized: Invalid token" };
    }

    if (isAdminLikeToken(decoded as unknown as Record<string, unknown>)) {
      return { ok: true, uid, email: decoded.email };
    }

    const userSnap = await adminDb().collection("users").doc(uid).get();
    const userData = (userSnap.exists ? userSnap.data() : undefined) as Record<string, unknown> | undefined;
    if (!userSnap.exists || !isAdminLikeUserDoc(userData)) {
      return { ok: false, status: 403, error: "Forbidden: Admin access required" };
    }

    return { ok: true, uid, email: decoded.email };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Token verification failed";
    return { ok: false, status: 401, error: `Unauthorized: ${message}` };
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = (await request.json()) as {
      to?: string;
      subject?: string;
      type?: InvoiceEmailLogType;
      invoiceNumber?: string;
      clientName?: string;
    };

    const to = String(body.to || "").trim();
    const type = String(body.type || "").trim() as InvoiceEmailLogType;
    const validTypes: InvoiceEmailLogType[] = [
      "invoice_sent",
      "reminder_24h",
      "overdue",
      "second_reminder",
      "payment_confirmation",
      "resend",
      "discount_update",
    ];

    if (!to || !validTypes.includes(type)) {
      return NextResponse.json({ error: "Missing or invalid log payload." }, { status: 400 });
    }

    await adminDb()
      .collection("external_invoice_email_logs")
      .add({
        to,
        subject: body.subject ? String(body.subject).trim() : "",
        type,
        invoiceNumber: body.invoiceNumber ? String(body.invoiceNumber).trim() : "",
        clientName: body.clientName ? String(body.clientName).trim() : "",
        sentAt: adminFieldValue().serverTimestamp(),
        sentBy: auth.email || auth.uid,
      });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to write email log.";
    console.error("[Email log API] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
