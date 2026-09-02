import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  ensureMercuryInvoiceForCrmInvoice,
  type CrmInvoiceForMercury,
} from "@/lib/mercury-invoice-sync";
import { getMercuryInvoice, readMercuryConfigFromEnv } from "@/lib/mercury";

export const dynamic = "force-dynamic";

function verifyProxySecret(request: NextRequest): boolean {
  const expected = String(process.env.MERCURY_PROXY_SECRET || "").trim();
  if (!expected) return false;
  const provided = request.headers.get("x-mercury-proxy-secret") || "";
  if (!provided || provided.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  } catch {
    return false;
  }
}

/**
 * Hostinger-side Mercury proxy (static IP whitelisted in Mercury).
 * Vercel CRM forwards invoice work here via MERCURY_PROXY_URL.
 */
export async function POST(request: NextRequest) {
  if (!verifyProxySecret(request)) {
    return NextResponse.json({ error: "Invalid proxy secret." }, { status: 401 });
  }

  if (!readMercuryConfigFromEnv()) {
    return NextResponse.json(
      {
        error:
          "Mercury is not configured on this host. Set MERCURY_API_TOKEN and MERCURY_DESTINATION_ACCOUNT_ID here.",
      },
      { status: 503 }
    );
  }

  let body: {
    action?: "ensure" | "get";
    invoice?: CrmInvoiceForMercury;
    mercuryInvoiceId?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const action = body.action || "ensure";

  try {
    if (action === "get") {
      const mercuryInvoiceId = String(body.mercuryInvoiceId || "").trim();
      if (!mercuryInvoiceId) {
        return NextResponse.json({ error: "mercuryInvoiceId is required." }, { status: 400 });
      }
      const config = readMercuryConfigFromEnv()!;
      const invoice = await getMercuryInvoice(config, mercuryInvoiceId);
      return NextResponse.json({ invoice });
    }

    if (!body.invoice?.id || !body.invoice.clientEmail) {
      return NextResponse.json({ error: "invoice payload is required." }, { status: 400 });
    }

    const mercury = await ensureMercuryInvoiceForCrmInvoice(body.invoice);
    return NextResponse.json({ success: true, ...mercury });
  } catch (error) {
    console.error("Mercury proxy error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Mercury proxy failed." },
      { status: 500 }
    );
  }
}

export async function GET() {
  const mercuryConfigured = Boolean(readMercuryConfigFromEnv());
  const proxyConfigured = Boolean(process.env.MERCURY_PROXY_SECRET?.trim());
  return NextResponse.json({
    ok: true,
    role: "mercury_proxy_host",
    mercuryConfigured,
    proxyConfigured,
    note: "Deploy this route on Hostinger. Whitelist this server's public IP on your Mercury API token.",
  });
}
