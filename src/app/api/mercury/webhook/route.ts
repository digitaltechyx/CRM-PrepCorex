import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminFieldValue } from "@/lib/firebase-admin";
import { syncOpenMercuryInvoices } from "@/lib/mercury-invoice-sync";
import { readMercuryConfigFromEnv, verifyMercuryWebhookSignature } from "@/lib/mercury";

export const dynamic = "force-dynamic";

function reachabilityResponse() {
  return NextResponse.json({
    ok: true,
    reachable: true,
    endpoint: "/api/mercury/webhook",
    message:
      "Webhook endpoint is reachable. Signed Mercury events will be processed when MERCURY_WEBHOOK_SECRET is set.",
  });
}

/**
 * Mercury webhook receiver.
 * Register in Mercury → Settings → Webhooks:
 *   URL: https://YOUR_CRM_HOST/api/mercury/webhook
 *   If Vercel Deployment Protection is on, append:
 *   ?x-vercel-protection-bypass=YOUR_BYPASS_SECRET
 *   Events: transaction.created, transaction.updated
 */
export async function GET() {
  return reachabilityResponse();
}

export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}

export async function POST(request: NextRequest) {
  const config = readMercuryConfigFromEnv();
  const rawBody = await request.text();
  const signature = request.headers.get("Mercury-Signature");

  // Mercury UI "Verify endpoint" (and some pre-create probes) do not send a signature yet.
  if (!signature) {
    return reachabilityResponse();
  }

  if (!config?.webhookSecret) {
    return NextResponse.json(
      {
        error:
          "MERCURY_WEBHOOK_SECRET is not set on the CRM server. Add the signing secret from Mercury, redeploy, then verify again.",
      },
      { status: 503 }
    );
  }

  if (!verifyMercuryWebhookSignature(rawBody, signature, config.webhookSecret)) {
    return NextResponse.json(
      {
        error:
          "Invalid Mercury-Signature. Confirm MERCURY_WEBHOOK_SECRET matches the secret shown when you created this webhook endpoint in Mercury.",
      },
      { status: 401 }
    );
  }

  let event: { resourceType?: string; id?: string };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  try {
    const resourceType = String(event.resourceType || "");
    if (resourceType === "transaction" && config) {
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
