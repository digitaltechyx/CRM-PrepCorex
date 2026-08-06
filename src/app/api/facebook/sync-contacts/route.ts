import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb, adminFieldValue } from "@/lib/firebase-admin";
import {
  readFacebookPageConfigFromEnv,
  syncFacebookMessengerContacts,
} from "@/lib/facebook-messenger-sync";

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
 * Sync people who messaged the Facebook Page into crm_contacts.
 * Stores name + Page-scoped Messenger ID (PSID). Email/phone only if Graph provides real values
 * (synthetic PSID@facebook.com emails are ignored). Spam contacts are skipped.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as { quiet?: boolean };
    const config = readFacebookPageConfigFromEnv();
    if (!config) {
      return NextResponse.json(
        {
          error:
            "Facebook Page sync is not configured. Set FACEBOOK_PAGE_ID and FACEBOOK_PAGE_ACCESS_TOKEN.",
          configured: false,
        },
        { status: body.quiet ? 200 : 500 }
      );
    }

    const result = await syncFacebookMessengerContacts({
      db: adminDb(),
      FieldValue: adminFieldValue(),
      uid: auth.uid,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("Facebook Messenger contact sync error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Failed to sync Facebook Messenger contacts.";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

export async function GET() {
  const config = readFacebookPageConfigFromEnv();
  return NextResponse.json({
    configured: Boolean(config),
    pageId: config?.pageId || null,
    note: "Requires a Page access token with pages_messaging. Syncs Page Messenger conversations only.",
  });
}
