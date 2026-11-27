/**
 * PrepCorex order deep-link shared by CRM invoice view/PDF (client + admin).
 *
 * Always point at production PrepCorex — CRM's NEXT_PUBLIC_APP_URL may be the CRM
 * host or a StockFlow-dev host, and /orders/open only exists on PrepCorex.
 */

const PREPCOREX_PRODUCTION_BASE = "https://prepcorex.com";

const NON_PREPCOREX_HOST_MARKERS = [
  "dev.prepservicesfba.com",
  "dev.psfstockflow.com",
  "ims.prepservicesfba.com",
  "crm.prepservicesfba.com",
  "crm-prep-corex.vercel.app",
  "localhost",
  "127.0.0.1",
];

function isUsablePrepcorexBase(url: string): boolean {
  const raw = String(url || "").trim().replace(/\/$/, "");
  if (!raw.startsWith("http://") && !raw.startsWith("https://")) return false;
  try {
    const host = new URL(raw).hostname.toLowerCase();
    if (!host) return false;
    if (NON_PREPCOREX_HOST_MARKERS.some((m) => host === m || host.endsWith(`.${m}`))) {
      return false;
    }
    if (host === "prepcorex.com" || host.endsWith(".prepcorex.com")) return true;
    if (host.includes("prepcorex") && host.endsWith(".vercel.app")) return true;
    return false;
  } catch {
    return false;
  }
}

export function getPrepcorexAppBaseUrl(): string {
  const dedicated = String(process.env.NEXT_PUBLIC_PREPCOREX_APP_URL || "")
    .trim()
    .replace(/\/$/, "");
  if (dedicated && isUsablePrepcorexBase(dedicated)) return dedicated;

  // Do not use CRM NEXT_PUBLIC_APP_URL when it is not a PrepCorex warehouse host.
  const appUrl = String(process.env.NEXT_PUBLIC_APP_URL || "")
    .trim()
    .replace(/\/$/, "");
  if (appUrl && isUsablePrepcorexBase(appUrl)) return appUrl;

  return PREPCOREX_PRODUCTION_BASE;
}

export function buildPrepcorexOrderOpenUrl(
  clientUserId: string,
  orderNumber: string
): string {
  const client = String(clientUserId || "").trim();
  const order = String(orderNumber || "").trim();
  if (!client || !order) return "";
  const params = new URLSearchParams({ order, client });
  return `${getPrepcorexAppBaseUrl()}/orders/open?${params.toString()}`;
}

/**
 * Prefer the shared bridge so invoice links work for clients and admins.
 * Always rebuild onto prepcorex.com when order + client are known (fixes old
 * dev.prepservicesfba.com / admin-inventory links).
 */
export function resolvePrepcorexOrderOpenUrl(input: {
  orderNumber?: string | null;
  clientUserId?: string | null;
  storedOrderUrl?: string | null;
}): string {
  const order = String(input.orderNumber || "").trim();
  const client = String(input.clientUserId || "").trim();
  const bridge = buildPrepcorexOrderOpenUrl(client, order);
  if (bridge) return bridge;

  const stored = String(input.storedOrderUrl || "").trim();
  if (!stored) return "";

  try {
    const url = new URL(stored);
    const legacyOrder =
      url.searchParams.get("order") ||
      url.searchParams.get("search") ||
      url.searchParams.get("q") ||
      "";
    const legacyClient =
      url.searchParams.get("client") || url.searchParams.get("userId") || "";
    const upgraded = buildPrepcorexOrderOpenUrl(legacyClient, legacyOrder);
    if (upgraded) return upgraded;

    // Relative /orders/open path — pin to PrepCorex production.
    if (url.pathname.includes("/orders/open")) {
      const params = new URLSearchParams(url.search);
      return `${getPrepcorexAppBaseUrl()}/orders/open?${params.toString()}`;
    }
  } catch {
    // relative path
    if (stored.startsWith("/orders/open")) {
      return `${getPrepcorexAppBaseUrl()}${stored}`;
    }
  }
  return stored;
}
