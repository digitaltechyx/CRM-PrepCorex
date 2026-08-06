import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import {
  isWhatsAppWebhookConfigured,
  pingWhatsAppCloudApi,
  readWhatsAppCloudConfigFromEnv,
} from "@/lib/whatsapp-cloud-sync";

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
    if (!uid) return { ok: false as const, status: 401, error: "Unauthorized: Invalid token" };
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
 * Check WhatsApp Cloud API webhook config (and optionally ping Graph).
 * Contacts arrive automatically via /api/whatsapp/webhook — there is no bulk pull.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const configured = isWhatsAppWebhookConfigured();
  const config = readWhatsAppCloudConfigFromEnv();
  const origin = request.nextUrl.origin;
  const webhookUrl = `${origin}/api/whatsapp/webhook`;

  let apiPing: Awaited<ReturnType<typeof pingWhatsAppCloudApi>> | null = null;
  if (config?.accessToken && config.phoneNumberId) {
    apiPing = await pingWhatsAppCloudApi(config);
  }

  return NextResponse.json({
    configured,
    webhookUrl,
    hasAppSecret: Boolean(config?.appSecret),
    hasAccessToken: Boolean(config?.accessToken),
    hasPhoneNumberId: Boolean(config?.phoneNumberId),
    apiPing,
    note:
      "WhatsApp Cloud API has no bulk contact list. New messagers are upserted into the address book via the webhook.",
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const config = readWhatsAppCloudConfigFromEnv();
  if (!config) {
    return NextResponse.json(
      {
        error:
          "WhatsApp is not configured. Set WHATSAPP_VERIFY_TOKEN (and ideally WHATSAPP_APP_SECRET, WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID).",
        configured: false,
      },
      { status: 500 }
    );
  }

  const ping = await pingWhatsAppCloudApi(config);
  const origin = request.nextUrl.origin;

  return NextResponse.json({
    success: true,
    configured: true,
    webhookUrl: `${origin}/api/whatsapp/webhook`,
    apiPing: ping,
    note:
      "Status check only — contacts sync live when people message your WhatsApp Business number.",
  });
}
