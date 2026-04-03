import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";

function normalizeRole(v: any): string {
  return String(v || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function isAdminLikeToken(claims: any): boolean {
  if (!claims) return false;
  if (claims.admin === true || claims.isAdmin === true) return true;
  if (claims.sub_admin === true || claims.subAdmin === true || claims.isSubAdmin === true) return true;
  const role = normalizeRole(claims.role);
  if (role === "admin" || role === "sub_admin" || role === "subadmin") return true;
  const roles = Array.isArray(claims.roles) ? claims.roles.map(normalizeRole) : [];
  if (roles.includes("admin") || roles.includes("sub_admin") || roles.includes("subadmin")) return true;
  return false;
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
    if (data.features.includes("admin_dashboard") || data.features.includes("manage_invoices") || data.features.includes("manage_users") || data.features.includes("manage_quotes")) return true;
  } else if (data.features && typeof data.features === "object") {
    if (data.features.admin_dashboard === true || data.features.manage_invoices === true || data.features.manage_users === true || data.features.manage_quotes === true) return true;
  }
  return false;
}

async function requireAdmin(request: NextRequest) {
  const header = request.headers.get("authorization") || "";
  if (!header.startsWith("Bearer ")) {
    console.error("[Email API] No Authorization header or not Bearer token");
    return { ok: false as const, status: 401, error: "Unauthorized: Missing or invalid authorization header" };
  }

  const token = header.slice("Bearer ".length).trim();
  if (!token) {
    console.error("[Email API] Empty token");
    return { ok: false as const, status: 401, error: "Unauthorized: Empty token" };
  }

  try {
    const decoded = await adminAuth().verifyIdToken(token);
    const uid = decoded?.uid;
    if (!uid) {
      console.error("[Email API] No UID in decoded token");
      return { ok: false as const, status: 401, error: "Unauthorized: Invalid token" };
    }

    if (isAdminLikeToken(decoded)) {
      console.log(`[Email API] Admin access granted via token for UID: ${uid}`);
      return { ok: true as const, uid };
    }

    const db = adminDb();
    const snap = await db.collection("users").doc(uid).get();
    const data = snap.exists ? snap.data() : null;
    
    if (!snap.exists) {
      console.error(`[Email API] User document not found for UID: ${uid}`);
      return { ok: false as const, status: 403, error: "Forbidden: User profile not found" };
    }
    
    if (!isAdminLikeUserDoc(data)) {
      console.error(`[Email API] User ${uid} is not an admin. Data:`, JSON.stringify(data, null, 2));
      return { ok: false as const, status: 403, error: "Forbidden: Admin access required" };
    }

    console.log(`[Email API] Admin access granted for UID: ${uid}`);
    return { ok: true as const, uid };
  } catch (error: any) {
    console.error("[Email API] Token verification error:", error?.message || error);
    return { ok: false as const, status: 401, error: `Unauthorized: ${error?.message || "Token verification failed"}` };
  }
}

export async function POST(request: NextRequest) {
  // Check admin authentication
  const auth = await requireAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const formData = await request.formData();
    const to = String(formData.get("to") || "").trim();
    const subject = String(formData.get("subject") || "").trim();
    const message = String(formData.get("message") || "");

    if (!to || !subject) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = Number(process.env.SMTP_PORT || 587);
    const smtpUser = process.env.SMTP_USER;
    const smtpPassword = process.env.SMTP_PASSWORD;
    const smtpSecure = process.env.SMTP_SECURE === "true";
    const smtpFrom = process.env.SMTP_FROM || smtpUser;
    const smtpFromName = process.env.SMTP_FROM_NAME || "Prep Services FBA";

    if (!smtpHost || !smtpUser || !smtpPassword) {
      return NextResponse.json({ error: "SMTP credentials are not configured." }, { status: 500 });
    }

    const attachmentFiles = formData.getAll("attachments").filter((file) => file instanceof File) as File[];
    const attachments = await Promise.all(
      attachmentFiles.map(async (file) => ({
        filename: file.name,
        content: Buffer.from(await file.arrayBuffer()),
      }))
    );

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure, // true for 465, false for other ports
      requireTLS: !smtpSecure, // require TLS for non-SSL ports
      auth: {
        user: smtpUser,
        pass: smtpPassword,
      },
      tls: {
        // Do not fail on invalid certs
        rejectUnauthorized: false,
      },
    });

    // Verify connection configuration
    await transporter.verify();

    await transporter.sendMail({
      from: smtpFromName ? `${smtpFromName} <${smtpFrom}>` : smtpFrom,
      to,
      subject,
      text: message,
      attachments,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Email send error:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to send email.";
    return NextResponse.json({ 
      error: errorMessage,
      details: error instanceof Error ? error.stack : undefined
    }, { status: 500 });
  }
}
