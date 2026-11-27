/** PrepCorex order deep-link shared by CRM invoice view/PDF (client + admin). */

export function getPrepcorexAppBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "https://prepcorex.com").replace(
    /\/$/,
    ""
  );
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
 * Upgrades legacy admin-only inventory URLs when order + client are known.
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

  // Legacy admin inventory deep link → bridge when we can parse order/client.
  try {
    const url = new URL(stored);
    if (url.pathname.includes("/admin/dashboard/inventory")) {
      const legacyOrder =
        url.searchParams.get("search") || url.searchParams.get("q") || "";
      const legacyClient =
        url.searchParams.get("userId") || url.searchParams.get("client") || "";
      const upgraded = buildPrepcorexOrderOpenUrl(legacyClient, legacyOrder);
      if (upgraded) return upgraded;
    }
    if (url.pathname.includes("/orders/open")) return stored;
  } catch {
    // relative or invalid — keep as-is if it looks like our bridge path
  }
  if (stored.includes("/orders/open")) return stored;
  return stored;
}
