import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminFieldValue } from "@/lib/firebase-admin";
import { syncOpenMercuryInvoices } from "@/lib/mercury-invoice-sync";
import { readMercuryConfigFromEnv, verifyMercuryWebhookSignature } from "@/lib/mercury";

export const dynamic = "force-dynamic";

/**
 * Mercury webhook receiver.
 * Register in Mercury → Settings → Webhooks:
 *   URL: https://YOUR_CRM_HOST/api/mercury/webhook
 *   Events: transaction.created, transaction.updated
 *
 * Mercury does not emit invoice.paid webhooks. When money arrives, we refresh
 * open CRM invoices that have mercuryInvoiceId and mark them paid when Mercury
 * reports status Paid.
 */
export async function POST(request: NextRequest) {
  const config = readMercuryConfigFromEnv();
  if (!config) {
    return NextResponse.json({ error: "Mercury is not configured." }, { status: 503 });
  }
  if (!config.webhookSecret) {
    return NextResponse.json({ error: "MERCURY_WEBHOOK_SECRET is not configured." }, { status: 503 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("Mercury-Signature");
  if (!verifyMercuryWebhookSignature(rawBody, signature, config.webhookSecret)) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  let event: { resourceType?: string; id?: string };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  try {
    const resourceType = String(event.resourceType || "");
    if (resourceType === "transaction") {
      const result = await syncOpenMercuryInvoices(adminDb(), adminFieldValue(), config);
      return NextResponse.json({ success: true, eventId: event.id, ...result });
    }

    return NextResponse.json({ success: true, ignored: true, resourceType });
  } catch (error) {
    console.error("Mercury webhook error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Webhook processing failed." },
      { status: 500 }
    );
  }
}

export async function GET() {
  const configured = Boolean(readMercuryConfigFromEnv()?.webhookSecret);
  return NextResponse.json({
    ok: true,
    endpoint: "/api/mercury/webhook",
    configured,
    note: "Mercury invoice payments are synced via transaction webhooks + Mercury invoice status polling.",
  });
}
