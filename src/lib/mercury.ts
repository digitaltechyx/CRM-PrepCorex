import crypto from "crypto";

const MERCURY_API_BASE = "https://api.mercury.com/api/v1";

export type MercuryConfig = {
  apiToken: string;
  destinationAccountId: string;
  webhookSecret: string;
  payUrlBase: string;
  creditCardEnabled: boolean;
  achDebitEnabled: boolean;
  useRealAccountNumber: boolean;
};

export type MercuryLineItem = {
  name: string;
  quantity: number;
  unitPrice: number;
  salesTaxRate?: number | null;
};

export type MercuryCustomer = {
  id: string;
  name: string;
  email: string;
};

export type MercuryInvoice = {
  id: string;
  slug: string;
  status: "Unpaid" | "Paid" | "Cancelled" | "Processing";
  amount: number;
  invoiceNumber: string;
  customerId: string;
};

export type MercuryWebhookEvent = {
  id: string;
  resourceType: string;
  resourceId: string;
  operationType: string;
  occurredAt: string;
  changedPaths?: string[];
  mergePatch?: Record<string, unknown>;
  previousValues?: Record<string, unknown>;
};

export function normalizeMercuryApiToken(raw: string): string {
  let token = String(raw || "").trim();
  if (!token) return "";

  // Vercel paste issues: wrapped quotes or trailing newlines
  if (
    (token.startsWith('"') && token.endsWith('"')) ||
    (token.startsWith("'") && token.endsWith("'"))
  ) {
    token = token.slice(1, -1).trim();
  }
  token = token.replace(/[\r\n]+/g, "");

  if (token.toLowerCase().startsWith("bearer ")) {
    token = token.slice(7).trim();
  }

  // Avoid double prefix if user pasted secret-token:secret-token:...
  while (token.startsWith("secret-token:secret-token:")) {
    token = token.replace(/^secret-token:/, "");
  }

  if (token.startsWith("mercury_") && !token.startsWith("secret-token:")) {
    token = `secret-token:${token}`;
  }

  return token;
}

export function readMercuryConfigFromEnv(): MercuryConfig | null {
  const apiToken = normalizeMercuryApiToken(process.env.MERCURY_API_TOKEN || "");
  const destinationAccountId = String(process.env.MERCURY_DESTINATION_ACCOUNT_ID || "").trim();
  const webhookSecret = String(process.env.MERCURY_WEBHOOK_SECRET || "").trim();
  if (!apiToken || !destinationAccountId) return null;
  return {
    apiToken,
    destinationAccountId,
    webhookSecret,
    payUrlBase: String(process.env.MERCURY_PAY_URL_BASE || "https://app.mercury.com/pay").replace(/\/$/, ""),
    creditCardEnabled: process.env.MERCURY_CREDIT_CARD_ENABLED !== "false",
    achDebitEnabled: process.env.MERCURY_ACH_DEBIT_ENABLED !== "false",
    useRealAccountNumber: process.env.MERCURY_USE_REAL_ACCOUNT_NUMBER === "true",
  };
}

export function buildMercuryPayUrl(slug: string, config: MercuryConfig): string {
  return `${config.payUrlBase}/${slug}`;
}

export function verifyMercuryWebhookSignature(
  payload: string,
  signatureHeader: string | null,
  secretKey: string,
  maxAgeSeconds = 300
): boolean {
  if (!signatureHeader || !secretKey) return false;

  const parts = signatureHeader.split(",");
  let timestamp = "";
  let signature = "";
  for (const part of parts) {
    const [key, value] = part.split("=", 2);
    if (key === "t") timestamp = value || "";
    if (key === "v1") signature = value || "";
  }
  if (!timestamp || !signature) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  const age = Math.abs(Math.floor(Date.now() / 1000) - ts);
  if (age > maxAgeSeconds) return false;

  const signedPayload = `${timestamp}.${payload}`;
  const expectedSignature = crypto.createHmac("sha256", secretKey).update(signedPayload).digest("hex");

  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
  } catch {
    return false;
  }
}

function formatMercuryApiError(status: number, body: unknown): string {
  const obj = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : null;
  const nested =
    obj?.errors && typeof obj.errors === "object" && obj.errors !== null
      ? (obj.errors as Record<string, unknown>)
      : null;

  const errorCode =
    (typeof nested?.errorCode === "string" && nested.errorCode) ||
    (typeof obj?.errorCode === "string" && obj.errorCode) ||
    "";
  const detail =
    (typeof nested?.message === "string" && nested.message) ||
    (typeof obj?.error === "string" && obj.error) ||
    (typeof obj?.message === "string" && obj.message) ||
    (typeof body === "string" ? body : "");

  if (errorCode === "ipNotWhitelisted") {
    return (
      "Mercury API token is IP-restricted. CRM runs on Vercel with changing server IPs — " +
      "edit the token in Mercury → Settings → API tokens and remove the IP whitelist (or disable IP restriction)."
    );
  }

  const label =
    status === 403
      ? "Mercury AR API access denied — confirm Plus/Pro subscription and token scopes."
      : status === 401
        ? "Mercury API token rejected — check MERCURY_API_TOKEN on Vercel and redeploy."
        : status === 400
          ? "Mercury rejected the invoice payload."
          : `Mercury API error (${status}).`;

  return detail ? `${label} ${detail}` : label;
}

async function mercuryRequest<T>(
  config: MercuryConfig,
  path: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(`${MERCURY_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.apiToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init?.headers || {}),
    },
  });

  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!response.ok) {
    throw new Error(formatMercuryApiError(response.status, body));
  }

  return body as T;
}

export async function listMercuryCustomers(config: MercuryConfig): Promise<MercuryCustomer[]> {
  const data = await mercuryRequest<{ customers?: MercuryCustomer[] }>(config, "/ar/customers");
  return Array.isArray(data.customers) ? data.customers : [];
}

export async function createMercuryCustomer(
  config: MercuryConfig,
  input: { name: string; email: string }
): Promise<MercuryCustomer> {
  const data = await mercuryRequest<{ customer: MercuryCustomer }>(config, "/ar/customers", {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      email: input.email,
    }),
  });
  if (!data.customer?.id) {
    throw new Error("Mercury did not return a customer id.");
  }
  return data.customer;
}

export async function findOrCreateMercuryCustomer(
  config: MercuryConfig,
  input: { name: string; email: string; existingCustomerId?: string | null }
): Promise<MercuryCustomer> {
  if (input.existingCustomerId) {
    return { id: input.existingCustomerId, name: input.name, email: input.email };
  }

  const normalizedEmail = input.email.trim().toLowerCase();
  const customers = await listMercuryCustomers(config);
  const existing = customers.find((c) => c.email?.trim().toLowerCase() === normalizedEmail);
  if (existing) return existing;

  return createMercuryCustomer(config, input);
}

export async function createMercuryInvoice(
  config: MercuryConfig,
  input: {
    customerId: string;
    invoiceNumber: string;
    invoiceDate: string;
    dueDate: string;
    lineItems: MercuryLineItem[];
    payerMemo?: string;
    internalNote?: string;
  }
): Promise<MercuryInvoice> {
  const data = await mercuryRequest<{ invoice: MercuryInvoice }>(config, "/ar/invoices", {
    method: "POST",
    body: JSON.stringify({
      customerId: input.customerId,
      invoiceNumber: input.invoiceNumber,
      invoiceDate: input.invoiceDate,
      dueDate: input.dueDate,
      destinationAccountId: config.destinationAccountId,
      ccEmails: [],
      creditCardEnabled: config.creditCardEnabled,
      achDebitEnabled: config.achDebitEnabled,
      useRealAccountNumber: config.useRealAccountNumber,
      sendEmailOption: "DontSend",
      lineItems: input.lineItems,
      payerMemo: input.payerMemo || null,
      internalNote: input.internalNote || null,
      currencyCode: "USD",
    }),
  });

  if (!data.invoice?.id || !data.invoice.slug) {
    throw new Error("Mercury did not return invoice id/slug.");
  }
  return data.invoice;
}

export async function getMercuryInvoice(
  config: MercuryConfig,
  invoiceId: string
): Promise<MercuryInvoice> {
  const data = await mercuryRequest<{ invoice: MercuryInvoice }>(
    config,
    `/ar/invoices/${encodeURIComponent(invoiceId)}`
  );
  if (!data.invoice?.id) {
    throw new Error("Mercury invoice not found.");
  }
  return data.invoice;
}
