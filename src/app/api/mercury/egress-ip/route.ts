import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";

/**
 * Admin-only helper: show the outbound IP this CRM deployment uses when
 * calling external APIs (e.g. Mercury). Useful for a temporary allowlist test
 * before enabling Vercel Static IPs.
 */

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

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const [v4Res, v6Res] = await Promise.allSettled([
      fetch("https://api64.ipify.org?format=json", { cache: "no-store" }),
      fetch("https://api.ipify.org?format=json", { cache: "no-store" }),
    ]);

    let ipv4: string | null = null;
    let ipv6: string | null = null;

    if (v4Res.status === "fulfilled" && v4Res.value.ok) {
      const data = (await v4Res.value.json()) as { ip?: string };
      const ip = String(data.ip || "").trim();
      if (ip.includes(":")) ipv6 = ip;
      else if (ip) ipv4 = ip;
    }
    if (v6Res.status === "fulfilled" && v6Res.value.ok) {
      const data = (await v6Res.value.json()) as { ip?: string };
      const ip = String(data.ip || "").trim();
      if (ip.includes(":")) ipv6 = ipv6 || ip;
      else if (ip) ipv4 = ipv4 || ip;
    }

    return NextResponse.json({
      ok: true,
      note:
        "This is the current outbound IP for THIS request only. Without Vercel Static IPs, the next request may use a different IP.",
      ipv4,
      ipv6,
      vercelRegion: process.env.VERCEL_REGION || null,
      proxyConfigured: Boolean(
        String(process.env.MERCURY_PROXY_URL || "").trim() &&
          String(process.env.MERCURY_PROXY_SECRET || "").trim()
      ),
      mercuryTokenConfigured: Boolean(String(process.env.MERCURY_API_TOKEN || "").trim()),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to detect egress IP",
      },
      { status: 500 }
    );
  }
}
