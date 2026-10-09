import { NextRequest } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { canAccessCrm } from "@/lib/crm-access";
import type { UserProfile } from "@/types";

export type CrmAutomationActor = {
  uid: string;
  name: string;
  via: "api_key" | "admin";
};

function readConfiguredKey(): string {
  return (
    process.env.CRM_AUTOMATION_API_KEY?.trim() ||
    process.env.CHATGPT_CRM_API_KEY?.trim() ||
    ""
  );
}

/** Normalize GPT / n8n Authorization quirks (Bearer, double Bearer, raw key). */
function extractPresentedSecrets(request: NextRequest): string[] {
  const out: string[] = [];
  const auth = (request.headers.get("authorization") || "").trim();
  if (auth) {
    out.push(auth);
    const bearerMatch = auth.match(/^Bearer\s+(.+)$/i);
    if (bearerMatch?.[1]) {
      let token = bearerMatch[1].trim();
      // GPT sometimes stores "Bearer <key>" and also adds Bearer → "Bearer Bearer <key>"
      if (/^Bearer\s+/i.test(token)) {
        token = token.replace(/^Bearer\s+/i, "").trim();
      }
      out.push(token);
    }
  }
  const apiKey = (request.headers.get("x-api-key") || "").trim();
  if (apiKey) out.push(apiKey);
  return out.filter(Boolean);
}

function tokenMatchesRequest(request: NextRequest, key: string): boolean {
  if (!key) return false;
  return extractPresentedSecrets(request).some((secret) => secret === key);
}

/** ChatGPT automation key, or CRM-eligible Firebase admin Bearer. */
export async function requireCrmAutomation(request: NextRequest) {
  const key = readConfiguredKey();
  if (key && tokenMatchesRequest(request, key)) {
    return {
      ok: true as const,
      actor: {
        uid: "crm-automation",
        name: "CRM automation",
        via: "api_key" as const,
      },
    };
  }

  const header = request.headers.get("authorization") || "";
  if (/^Bearer\s+/i.test(header)) {
    const token = header.replace(/^Bearer\s+/i, "").trim().replace(/^Bearer\s+/i, "").trim();
    if (token && token !== key) {
      try {
        const decoded = await getAdminAuth().verifyIdToken(token);
        const uid = decoded?.uid;
        if (uid) {
          const snap = await getAdminDb().collection("users").doc(uid).get();
          const data = (snap.exists ? snap.data() : null) as UserProfile | null;
          if (canAccessCrm(data)) {
            return {
              ok: true as const,
              actor: {
                uid,
                name: String(data?.name || data?.email || decoded.name || decoded.email || ""),
                via: "admin" as const,
              },
            };
          }
          return { ok: false as const, status: 403, error: "Forbidden" };
        }
      } catch {
        /* fall through */
      }
    }
  }

  if (!key) {
    return {
      ok: false as const,
      status: 503,
      error: "CRM automation is not configured. Set CRM_AUTOMATION_API_KEY on the server.",
    };
  }

  return {
    ok: false as const,
    status: 401,
    error:
      "Unauthorized. Use Authorization: Bearer <CRM_AUTOMATION_API_KEY> (same value as Vercel env on crm.prepservicesfba.com).",
  };
}
