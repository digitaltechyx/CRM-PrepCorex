import type { CrmInvoiceForMercury } from "@/lib/mercury-invoice-sync";
import type { MercuryInvoice } from "@/lib/mercury";

export type MercuryProxyConfig = {
  baseUrl: string;
  secret: string;
};

export function readMercuryProxyFromEnv(): MercuryProxyConfig | null {
  const baseUrl = String(process.env.MERCURY_PROXY_URL || "")
    .trim()
    .replace(/\/$/, "");
  const secret = String(process.env.MERCURY_PROXY_SECRET || "").trim();
  if (!baseUrl || !secret) return null;
  return { baseUrl, secret };
}

export function isMercuryConfiguredLocally(): boolean {
  return Boolean(readMercuryProxyFromEnv()) || Boolean(process.env.MERCURY_API_TOKEN?.trim());
}

async function readProxyError(response: Response, fallback: string): Promise<string> {
  const text = await response.text();
  try {
    const json = JSON.parse(text) as { error?: string };
    if (json.error) return json.error;
  } catch {
    // ignore
  }
  return text || `${fallback} (HTTP ${response.status})`;
}

export async function ensureMercuryInvoiceViaProxy(
  proxy: MercuryProxyConfig,
  invoice: CrmInvoiceForMercury
): Promise<{
  mercuryCustomerId: string;
  mercuryInvoiceId: string;
  mercuryPaymentUrl: string;
  mercuryInvoiceStatus: string;
}> {
  const response = await fetch(`${proxy.baseUrl}/api/mercury/proxy/invoices`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-mercury-proxy-secret": proxy.secret,
    },
    body: JSON.stringify({ action: "ensure", invoice }),
  });

  if (!response.ok) {
    throw new Error(await readProxyError(response, "Mercury proxy request failed"));
  }

  return response.json();
}

export async function getMercuryInvoiceViaProxy(
  proxy: MercuryProxyConfig,
  mercuryInvoiceId: string
): Promise<MercuryInvoice> {
  const response = await fetch(`${proxy.baseUrl}/api/mercury/proxy/invoices`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-mercury-proxy-secret": proxy.secret,
    },
    body: JSON.stringify({ action: "get", mercuryInvoiceId }),
  });

  if (!response.ok) {
    throw new Error(await readProxyError(response, "Mercury proxy lookup failed"));
  }

  const data = (await response.json()) as { invoice: MercuryInvoice };
  if (!data.invoice?.id) {
    throw new Error("Mercury proxy did not return invoice data.");
  }
  return data.invoice;
}
