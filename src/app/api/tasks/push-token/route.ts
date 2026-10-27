import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb, adminFieldValue } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function authenticatedUid(request: NextRequest): Promise<string | null> {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  try {
    return (await adminAuth().verifyIdToken(header.slice(7).trim())).uid || null;
  } catch {
    return null;
  }
}

function tokenId(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function POST(request: NextRequest) {
  const uid = await authenticatedUid(request);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!token) return NextResponse.json({ error: "Missing push token" }, { status: 400 });

  await adminDb()
    .collection("users")
    .doc(uid)
    .collection("pushTokens")
    .doc(tokenId(token))
    .set(
      {
        token,
        platform: "web",
        userAgent: typeof body.userAgent === "string" ? body.userAgent.slice(0, 500) : null,
        timezone: typeof body.timezone === "string" ? body.timezone.slice(0, 100) : null,
        active: true,
        updatedAt: adminFieldValue().serverTimestamp(),
      },
      { merge: true }
    );

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const uid = await authenticatedUid(request);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!token) return NextResponse.json({ error: "Missing push token" }, { status: 400 });

  await adminDb()
    .collection("users")
    .doc(uid)
    .collection("pushTokens")
    .doc(tokenId(token))
    .delete();
  return NextResponse.json({ ok: true });
}

