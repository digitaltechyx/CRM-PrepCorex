import { NextRequest } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

function normalizeRole(v: unknown): string {
  return String(v || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function isAdminLikeToken(claims: Record<string, unknown> | null | undefined): boolean {
  if (!claims) return false;
  if (claims.admin === true || claims.isAdmin === true) return true;
  if (claims.sub_admin === true || claims.subAdmin === true || claims.isSubAdmin === true) {
    return true;
  }
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
  if (roles.includes("admin") || roles.includes("sub_admin") || roles.includes("subadmin")) {
    return true;
  }
  if (Array.isArray(data.features)) {
    return (
      data.features.includes("admin_dashboard") ||
      data.features.includes("manage_invoices") ||
      data.features.includes("manage_quotes")
    );
  }
  if (data.features && typeof data.features === "object") {
    const features = data.features as Record<string, unknown>;
    return (
      features.admin_dashboard === true ||
      features.manage_invoices === true ||
      features.manage_quotes === true
    );
  }
  return false;
}

export async function requireMailboxAdmin(request: NextRequest) {
  const header = request.headers.get("authorization") || "";
  if (!header.startsWith("Bearer ")) {
    return { ok: false as const, status: 401, error: "Unauthorized" };
  }
  const token = header.slice("Bearer ".length).trim();
  if (!token) {
    return { ok: false as const, status: 401, error: "Unauthorized" };
  }

  try {
    const decoded = await adminAuth().verifyIdToken(token);
    const uid = decoded?.uid;
    if (!uid) {
      return { ok: false as const, status: 401, error: "Unauthorized" };
    }
    if (isAdminLikeToken(decoded as Record<string, unknown>)) {
      return { ok: true as const, uid, email: String(decoded.email || "") };
    }
    const snap = await adminDb().collection("users").doc(uid).get();
    const data = snap.exists ? (snap.data() as Record<string, unknown>) : null;
    if (!isAdminLikeUserDoc(data)) {
      return { ok: false as const, status: 403, error: "Forbidden" };
    }
    return { ok: true as const, uid, email: String(decoded.email || data?.email || "") };
  } catch {
    return { ok: false as const, status: 401, error: "Unauthorized" };
  }
}
