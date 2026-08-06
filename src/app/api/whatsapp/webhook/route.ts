import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminFieldValue } from "@/lib/firebase-admin";
import {
  processWhatsAppWebhookPayload,
  readWhatsAppCloudConfigFromEnv,
  verifyWhatsAppSignature,
} from "@/lib/whatsapp-cloud-sync";

export const dynamic = "force-dynamic";

/**
 * Meta WhatsApp Cloud API webhook verification (GET).
 * Callback URL: https://YOUR_CRM_HOST/api/whatsapp/webhook
 */
export async function GET(request: NextRequest) {
  const config = readWhatsAppCloudConfigFromEnv();
  if (!config) {
    return new NextResponse("WhatsApp webhook not configured", { status: 503 });
  }

  const mode = request.nextUrl.searchParams.get("hub.mode");
  const token = request.nextUrl.searchParams.get("hub.verify_token");
  const challenge = request.nextUrl.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === config.verifyToken && challenge) {
    return new NextResponse(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  return new NextResponse("Forbidden", { status: 403 });
}

/**
 * Incoming WhatsApp messages → upsert name + wa_id into crm_contacts.
 * Message body is not stored. Spam contacts are skipped.
 */
export async function POST(request: NextRequest) {
  const config = readWhatsAppCloudConfigFromEnv();
  if (!config) {
    return NextResponse.json({ error: "WhatsApp webhook not configured" }, { status: 503 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  if (!verifyWhatsAppSignature(rawBody, signature, config.appSecret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const result = await processWhatsAppWebhookPayload(
      adminDb(),
      adminFieldValue(),
      body as Parameters<typeof processWhatsAppWebhookPayload>[2]
    );
    // Meta expects a quick 200 even if we skip empty payloads.
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("WhatsApp webhook error:", error);
    // Still 200 when possible so Meta does not disable the webhook for transient errors —
    // but log loudly. Return 500 only for unexpected failures so Meta retries.
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Webhook processing failed" },
      { status: 500 }
    );
  }
}
