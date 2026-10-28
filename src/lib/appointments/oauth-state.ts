import { createHmac, timingSafeEqual } from "crypto";

function secret(): string {
  return (
    process.env.GOOGLE_CALENDAR_OAUTH_STATE_SECRET?.trim() ||
    process.env.CRM_AUTOMATION_API_KEY?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    "crm-appointments-dev-state"
  );
}

export function createCalendarOAuthState(uid: string): string {
  const payload = Buffer.from(
    JSON.stringify({ uid, t: Date.now() }),
    "utf8"
  ).toString("base64url");
  const sig = createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyCalendarOAuthState(state: string): { uid: string } | null {
  const [payload, sig] = String(state || "").split(".");
  if (!payload || !sig) return null;
  const expected = createHmac("sha256", secret()).update(payload).digest("base64url");
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  try {
    const raw = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      uid?: string;
      t?: number;
    };
    if (!raw.uid || typeof raw.t !== "number") return null;
    // 30 minutes
    if (Date.now() - raw.t > 30 * 60 * 1000) return null;
    return { uid: raw.uid };
  } catch {
    return null;
  }
}
