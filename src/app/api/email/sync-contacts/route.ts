import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb, adminFieldValue } from "@/lib/firebase-admin";
import { syncEmailContacts } from "@/lib/imap-contact-sync";
import { readImapMailboxesFromEnv } from "@/lib/imap-mailboxes";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

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
  if (roles.includes("admin") || roles.includes("sub_admin") || roles.includes("subadmin")) return true;
  return false;
}

function isAdminLikeUserDoc(data: Record<string, unknown> | null | undefined): boolean {
  if (!data) return false;
  if (data.isAdmin === true || data.admin === true || data.is_admin === true) return true;
  if (data.isSubAdmin === true || data.is_sub_admin === true) return true;
  const role = normalizeRole(data.role || data.userRole || data.userType);
  if (role === "admin" || role === "sub_admin" || role === "subadmin") return true;
  const roles = Array.isArray(data.roles) ? data.roles.map(normalizeRole) : [];
  if (roles.includes("admin") || roles.includes("sub_admin") || roles.includes("subadmin")) return true;
  return false;
}

async function requireAdmin(request: NextRequest) {
  const header = request.headers.get("authorization") || "";
  if (!header.startsWith("Bearer ")) {
    return { ok: false as const, status: 401, error: "Unauthorized: Missing or invalid authorization header" };
  }

  const token = header.slice("Bearer ".length).trim();
  if (!token) {
    return { ok: false as const, status: 401, error: "Unauthorized: Empty token" };
  }

  try {
    const decoded = await adminAuth().verifyIdToken(token);
    const uid = decoded?.uid;
    if (!uid) {
      return { ok: false as const, status: 401, error: "Unauthorized: Invalid token" };
    }

    if (isAdminLikeToken(decoded as Record<string, unknown>)) {
      return { ok: true as const, uid };
    }

    const snap = await adminDb().collection("users").doc(uid).get();
    const data = snap.exists ? (snap.data() as Record<string, unknown>) : null;
    if (!snap.exists || !isAdminLikeUserDoc(data)) {
      return { ok: false as const, status: 403, error: "Forbidden: Admin access required" };
    }

    return { ok: true as const, uid };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Token verification failed";
    return { ok: false as const, status: 401, error: `Unauthorized: ${message}` };
  }
}

/**
 * Sync sender contacts from IMAP inboxes (info@ + arshad@).
 * Reads envelopes + a short body snippet per sender for signature phone/company.
 * Raw email body is not stored in Firestore.
 * Sending remains SMTP info@ only (unchanged).
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as { mode?: string };
    const mode =
      body.mode === "full" || body.mode === "incremental" ? body.mode : undefined;

    const configured = readImapMailboxesFromEnv();
    if (configured.length === 0) {
      return NextResponse.json(
        {
          error:
            "IMAP mailboxes are not configured. Set IMAP_PASSWORD_INFO (or SMTP_PASSWORD) and IMAP_PASSWORD_ARSHAD.",
        },
        { status: 500 }
      );
    }

    const result = await syncEmailContacts({
      db: adminDb(),
      FieldValue: adminFieldValue(),
      uid: auth.uid,
      mode,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("Email contact sync error:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to sync email contacts.";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

export async function GET() {
  const configured = readImapMailboxesFromEnv().map((m) => ({
    id: m.id,
    user: m.user,
    configured: true,
  }));
  return NextResponse.json({
    mailboxes: configured,
    note: "Outbound email still uses SMTP_USER (info@) only.",
  });
}
