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

function tokenMatchesRequest(request: NextRequest, key: string): boolean {
  const bearer = request.headers.get("authorization") || "";
  if (bearer === `Bearer ${key}`) return true;
  const apiKey = request.headers.get("x-api-key") || "";
  return apiKey === key;
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
  if (header.startsWith("Bearer ")) {
    const token = header.slice("Bearer ".length).trim();
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

  return { ok: false as const, status: 401, error: "Unauthorized" };
}
